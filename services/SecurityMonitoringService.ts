import { getSupabaseClient } from '../utils/supabase.ts';

export interface SecurityEvent {
  id: string;
  userId?: string;
  eventType: 'login_success' | 'login_failed' | 'logout' | 'force_logout' | 'account_compromised' | 'rate_limit_exceeded' | 'token_blacklisted' | 'suspicious_activity';
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  details: Record<string, string | number | boolean>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface SecurityAlert {
  id: string;
  type: 'multiple_failed_logins' | 'unusual_location' | 'account_compromise' | 'rate_limit_violation' | 'suspicious_activity';
  userId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

// In production, these should be stored in a database
const securityEvents: SecurityEvent[] = [];
const securityAlerts: SecurityAlert[] = [];
const userLoginAttempts = new Map<string, { count: number; lastAttempt: Date; ips: Set<string> }>();

export class SecurityMonitoringService {
  private static instance: SecurityMonitoringService;
  private supabase: ReturnType<typeof getSupabaseClient> | null = null;

  private constructor() {}

  private getSupabase() {
    if (!this.supabase) {
      this.supabase = getSupabaseClient();
    }
    return this.supabase!;
  }

  public static getInstance(): SecurityMonitoringService {
    if (!SecurityMonitoringService.instance) {
      SecurityMonitoringService.instance = new SecurityMonitoringService();
    }
    return SecurityMonitoringService.instance;
  }

  /**
   * Log a security event
   */
  public logEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): void {
    const securityEvent: SecurityEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date()
    };

    securityEvents.push(securityEvent);
    
    // Keep only last 1000 events in memory
    if (securityEvents.length > 1000) {
      securityEvents.shift();
    }

    // Check for suspicious patterns
    this.analyzeEvent(securityEvent);
    
    console.log(`🔒 Security Event: ${event.eventType} - ${event.severity} severity`);
  }

  /**
   * Analyze event for suspicious patterns
   */
  private analyzeEvent(event: SecurityEvent): void {
    if (!event.userId) return;

    // Track login attempts
    if (event.eventType === 'login_failed') {
      this.trackFailedLogin(event);
    }

    // Check for multiple failed logins
    if (event.eventType === 'login_failed') {
      this.checkMultipleFailedLogins(event);
    }

    // Check for unusual activity patterns
    this.checkUnusualActivity(event);
  }

  /**
   * Track failed login attempts
   */
  private trackFailedLogin(event: SecurityEvent): void {
    const userId = event.userId!;
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    if (!userLoginAttempts.has(userId)) {
      userLoginAttempts.set(userId, {
        count: 1,
        lastAttempt: now,
        ips: new Set([event.ipAddress])
      });
    } else {
      const attempts = userLoginAttempts.get(userId)!;
      
      // Reset if last attempt was more than 5 minutes ago
      if (attempts.lastAttempt < fiveMinutesAgo) {
        attempts.count = 1;
        attempts.ips.clear();
        attempts.ips.add(event.ipAddress);
      } else {
        attempts.count++;
        attempts.ips.add(event.ipAddress);
      }
      
      attempts.lastAttempt = now;
    }
  }

  /**
   * Check for multiple failed logins
   */
  private checkMultipleFailedLogins(event: SecurityEvent): void {
    const userId = event.userId!;
    const attempts = userLoginAttempts.get(userId);

    if (attempts && attempts.count >= 5) {
      // Create security alert
      this.createAlert({
        type: 'multiple_failed_logins',
        userId,
        severity: attempts.count >= 10 ? 'critical' : 'high',
        message: `Multiple failed login attempts detected: ${attempts.count} attempts from ${attempts.ips.size} different IPs`,
        timestamp: new Date(),
        resolved: false
      });

      // Mark account as potentially compromised
      this.logEvent({
        userId,
        eventType: 'account_compromised',
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        details: {
          reason: 'Multiple failed logins',
          attemptCount: attempts.count,
          uniqueIPs: attempts.ips.size
        },
        severity: 'high'
      });
    }
  }

  /**
   * Check for unusual activity patterns
   */
  private checkUnusualActivity(event: SecurityEvent): void {
    const userId = event.userId!;
    
    // Get recent events for this user
    const recentEvents = securityEvents
      .filter(e => e.userId === userId)
      .filter(e => e.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000)) // Last 24 hours
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Check for rapid successive events
    if (recentEvents.length >= 3) {
      const timeSpan = recentEvents[0].timestamp.getTime() - recentEvents[recentEvents.length - 1].timestamp.getTime();
      const minutes = timeSpan / (1000 * 60);

      if (minutes < 5 && recentEvents.length >= 10) {
        this.createAlert({
          type: 'suspicious_activity',
          userId,
          severity: 'medium',
          message: `Unusual activity pattern detected: ${recentEvents.length} events in ${minutes.toFixed(1)} minutes`,
          timestamp: new Date(),
          resolved: false
        });
      }
    }
  }

  /**
   * Create a security alert
   */
  public createAlert(alert: Omit<SecurityAlert, 'id'>): void {
    const securityAlert: SecurityAlert = {
      ...alert,
      id: crypto.randomUUID()
    };

    securityAlerts.push(securityAlert);
    
    // Keep only last 500 alerts in memory
    if (securityAlerts.length > 500) {
      securityAlerts.shift();
    }

    console.warn(`🚨 Security Alert: ${alert.type} - ${alert.severity} severity for user ${alert.userId}`);
  }

  /**
   * Resolve a security alert
   */
  public resolveAlert(alertId: string, resolvedBy: string): boolean {
    const alert = securityAlerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      alert.resolvedBy = resolvedBy;
      return true;
    }
    return false;
  }

  /**
   * Get security events for a user
   */
  public getUserEvents(userId: string, limit: number = 50): SecurityEvent[] {
    return securityEvents
      .filter(e => e.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get active security alerts
   */
  public getActiveAlerts(): SecurityAlert[] {
    return securityAlerts.filter(a => !a.resolved);
  }

  /**
   * Get security statistics
   */
  public getSecurityStats(): {
    totalEvents: number;
    activeAlerts: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    recentActivity: SecurityEvent[];
  } {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};

    securityEvents.forEach(event => {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
    });

    return {
      totalEvents: securityEvents.length,
      activeAlerts: securityAlerts.filter(a => !a.resolved).length,
      eventsByType,
      eventsBySeverity,
      recentActivity: securityEvents
        .filter(e => e.timestamp > oneHourAgo)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 20)
    };
  }

  /**
   * Clean up old data
   */
  public cleanup(): void {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Remove old events
    const oldEventIndex = securityEvents.findIndex(e => e.timestamp < oneWeekAgo);
    if (oldEventIndex > -1) {
      securityEvents.splice(0, oldEventIndex + 1);
    }

    // Remove old alerts
    const oldAlertIndex = securityAlerts.findIndex(a => a.timestamp < oneWeekAgo);
    if (oldAlertIndex > -1) {
      securityAlerts.splice(0, oldAlertIndex + 1);
    }

    // Clean up user login attempts
    for (const [userId, attempts] of userLoginAttempts.entries()) {
      if (attempts.lastAttempt < oneWeekAgo) {
        userLoginAttempts.delete(userId);
      }
    }
  }

  /**
   * Export security data for analysis
   */
  public exportSecurityData(): {
    events: SecurityEvent[];
    alerts: SecurityAlert[];
    stats: ReturnType<SecurityMonitoringService['getSecurityStats']>;
  } {
    return {
      events: [...securityEvents],
      alerts: [...securityAlerts],
      stats: this.getSecurityStats()
    };
  }
}

// Export singleton instance
export const securityMonitor = SecurityMonitoringService.getInstance(); 