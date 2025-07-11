import { Hono } from "hono";
import { cors } from "hono/cors";
import { smartRateLimiter } from "../utils/rateLimiter.ts";
import { EnhancedDatabaseMonitor } from "../services/EnhancedDatabaseMonitor.ts";
import { WhatsAppAlertsService } from "../services/WhatsAppAlertsService.ts";
import { getSupabaseClient } from "../utils/supabase.ts";
import { authMiddleware, requireAdminOrOwner } from "../middleware/auth.ts";
import { securityMonitor } from "../services/SecurityMonitoringService.ts";
import { tokenService } from "../services/TokenManagementService.ts";

const monitoring = new Hono();

// Apply CORS and rate limiting
monitoring.use("*", cors());
monitoring.use("*", smartRateLimiter());

// Apply authentication middleware to all routes
monitoring.use("*", authMiddleware);

/**
 * GET /monitoring/health
 * Health check endpoint with detailed system status
 */
monitoring.get("/health", async (c) => {
  try {
    const supabase = getSupabaseClient();
    
    // Basic connectivity test
    const { data: _data, error } = await supabase.from('profiles').select('count').limit(1);
    
    if (error) {
      return c.json({
        status: "unhealthy",
        database: "error",
        error: error.message,
        timestamp: new Date().toISOString()
      }, 500);
    }

    // Collect basic metrics
    const metrics = await EnhancedDatabaseMonitor.collectMetrics();
    const alertStats = await EnhancedDatabaseMonitor.getAlertStatistics();

    return c.json({
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
      metrics: {
        ordersPerDay: metrics.ordersPerDay,
        avgQueryTime: metrics.avgQueryTime,
        databaseSize: metrics.databaseSize,
        activeConnections: metrics.activeConnections,
        errorRate: metrics.errorRate
      },
      alerts: alertStats,
      environment: Deno.env.get("ENVIRONMENT") || "development"
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({
      status: "error",
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

/**
 * POST /monitoring/check
 * Manual trigger for monitoring check
 */
monitoring.post("/check", async (c) => {
  try {
    console.log('🔍 Manual monitoring check triggered');
    
    await EnhancedDatabaseMonitor.runDailyCheckWithWhatsApp();
    
    return c.json({
      success: true,
      message: "Monitoring check completed",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error('❌ Error in manual monitoring check:', error);
    
    return c.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

/**
 * POST /monitoring/emergency
 * Emergency monitoring check (bypasses business hours)
 */
monitoring.post("/emergency", async (c) => {
  try {
    console.log('🚨 Emergency monitoring check triggered');
    
    await EnhancedDatabaseMonitor.runEmergencyCheck();
    
    return c.json({
      success: true,
      message: "Emergency check completed",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error('❌ Error in emergency check:', error);
    
    return c.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

/**
 * GET /monitoring/metrics
 * Get current system metrics
 */
monitoring.get("/metrics", async (c) => {
  try {
    const metrics = await EnhancedDatabaseMonitor.collectMetrics();
    const triggers = await EnhancedDatabaseMonitor.checkMigrationTriggers(metrics);
    
    return c.json({
      metrics,
      triggers,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error('❌ Error getting metrics:', error);
    
    return c.json({
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

/**
 * GET /monitoring/alerts
 * Get alert statistics and history
 */
monitoring.get("/alerts", async (c) => {
  try {
    const stats = await EnhancedDatabaseMonitor.getAlertStatistics();
    const supabase = getSupabaseClient();
    
    // Get recent alerts
    const { data: recentAlerts, error } = await supabase
      .from('whatsapp_logs')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching recent alerts:', error);
    }

    return c.json({
      statistics: stats,
      recentAlerts: recentAlerts || [],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error('❌ Error getting alerts:', error);
    
    return c.json({
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

/**
 * POST /monitoring/whatsapp/webhook
 * WhatsApp webhook for receiving messages
 */
monitoring.post("/whatsapp/webhook", async (c) => {
  try {
    const body = await c.req.json();
    
    // Verify webhook signature (implement proper verification)
    const signature = c.req.header('x-hub-signature-256');
    if (!signature) {
      return c.json({ error: "Missing signature" }, 401);
    }

    // Handle different types of messages
    if (body.entry && body.entry[0]?.changes) {
      for (const change of body.entry[0].changes) {
        if (change.value?.messages) {
          for (const message of change.value.messages) {
            const phoneNumber = message.from;
            const messageText = message.text?.body || '';
            
            console.log(`📱 WhatsApp message from ${phoneNumber}: ${messageText}`);
            
            // Handle commands
            await WhatsAppAlertsService.handleIncomingMessage(phoneNumber, messageText);
          }
        }
      }
    }

    return c.json({ success: true });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error('❌ Error processing WhatsApp webhook:', error);
    
    return c.json({
      error: errorMessage
    }, 500);
  }
});

/**
 * GET /monitoring/whatsapp/webhook
 * WhatsApp webhook verification
 */
monitoring.get("/whatsapp/webhook", (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  // Verify token (should match your WhatsApp app configuration)
  const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
  
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ WhatsApp webhook verified');
    return c.text(challenge || '');
  } else {
    console.log('❌ WhatsApp webhook verification failed');
    return c.text('Forbidden', 403);
  }
});

/**
 * POST /monitoring/test-alert
 * Test endpoint to send a test alert
 */
monitoring.post("/test-alert", async (c) => {
  try {
    const { type = 'warning', phoneNumber: _phoneNumber } = await c.req.json();
    
    if (type === 'critical') {
      await WhatsAppAlertsService.sendCriticalAlert(
        'test_metric',
        1500,
        1000,
        'Esta es una alerta de prueba crítica'
      );
    } else {
      await WhatsAppAlertsService.sendWarningAlert(
        'test_metric',
        800,
        500,
        'Esta es una alerta de prueba de warning'
      );
    }
    
    return c.json({
      success: true,
      message: `Test ${type} alert sent`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error('❌ Error sending test alert:', error);
    
    return c.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

/**
 * POST /monitoring/configure
 * Configure monitoring thresholds
 */
monitoring.post("/configure", async (c) => {
  try {
    const { metric, threshold, action, severity } = await c.req.json();
    
    await EnhancedDatabaseMonitor.configureCustomAlerts(
      metric,
      threshold,
      action,
      severity
    );
    
    return c.json({
      success: true,
      message: "Configuration updated",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error('❌ Error configuring monitoring:', error);
    
    return c.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

/**
 * GET /monitoring/report
 * Generate and return monitoring report
 */
monitoring.get("/report", async (c) => {
  try {
    const isWeekly = c.req.query('type') === 'weekly';
    const metrics = await EnhancedDatabaseMonitor.collectMetrics();
    
    let report: string;
    if (isWeekly) {
      report = await EnhancedDatabaseMonitor.generateWeeklyReport(metrics);
    } else {
      report = await EnhancedDatabaseMonitor.generateMigrationReport(metrics);
    }
    
    return c.json({
      report,
      type: isWeekly ? 'weekly' : 'daily',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error('❌ Error generating report:', error);
    
    return c.json({
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// Get security statistics (admin/owner only)
monitoring.get("/security/stats", requireAdminOrOwner, (c) => {
  try {
    const stats = securityMonitor.getSecurityStats();
    const tokenStats = tokenService.getStats();

    return c.json({
      message: "Security statistics retrieved successfully",
      code: "SECURITY_STATS_SUCCESS",
      data: {
        security: stats,
        tokens: tokenStats
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to get security statistics";
    return c.json({ error: errorMessage }, 500);
  }
});

// Get active security alerts (admin/owner only)
monitoring.get("/security/alerts", requireAdminOrOwner, (c) => {
  try {
    const alerts = securityMonitor.getActiveAlerts();

    return c.json({
      message: "Active security alerts retrieved successfully",
      code: "SECURITY_ALERTS_SUCCESS",
      data: {
        alerts,
        count: alerts.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to get security alerts";
    return c.json({ error: errorMessage }, 500);
  }
});

// Resolve a security alert (admin/owner only)
monitoring.post("/security/alerts/:alertId/resolve", requireAdminOrOwner, (c) => {
  try {
    const { alertId } = c.req.param();
    const user = c.get('user') as { id: string };
    
    const resolved = securityMonitor.resolveAlert(alertId, user.id);

    if (!resolved) {
      return c.json({
        error: "Alert not found or already resolved",
        code: "ALERT_NOT_FOUND"
      }, 404);
    }

    return c.json({
      message: "Security alert resolved successfully",
      code: "ALERT_RESOLVED_SUCCESS",
      data: { alertId },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to resolve security alert";
    return c.json({ error: errorMessage }, 500);
  }
});

// Get user security events (admin/owner only)
monitoring.get("/security/users/:userId/events", requireAdminOrOwner, (c) => {
  try {
    const { userId } = c.req.param();
    const limit = parseInt(c.req.query('limit') || '50');
    
    const events = securityMonitor.getUserEvents(userId, limit);

    return c.json({
      message: "User security events retrieved successfully",
      code: "USER_EVENTS_SUCCESS",
      data: {
        userId,
        events,
        count: events.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to get user security events";
    return c.json({ error: errorMessage }, 500);
  }
});

// Get compromised account information (admin/owner only)
monitoring.get("/security/compromised-accounts", requireAdminOrOwner, (c) => {
  try {
    // This would typically query a database in production
    // For now, we'll return a placeholder response
    const compromisedAccounts: { userId: string; reason: string; markedAt: Date; markedBy: string }[] = []; // Placeholder - implement based on your storage

    return c.json({
      message: "Compromised accounts retrieved successfully",
      code: "COMPROMISED_ACCOUNTS_SUCCESS",
      data: {
        accounts: compromisedAccounts,
        count: compromisedAccounts.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to get compromised accounts";
    return c.json({ error: errorMessage }, 500);
  }
});

// Export security data for analysis (admin/owner only)
monitoring.get("/security/export", requireAdminOrOwner, (c) => {
  try {
    const exportData = securityMonitor.exportSecurityData();

    return c.json({
      message: "Security data exported successfully",
      code: "SECURITY_EXPORT_SUCCESS",
      data: exportData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to export security data";
    return c.json({ error: errorMessage }, 500);
  }
});

// Clean up old security data (admin/owner only)
monitoring.post("/security/cleanup", requireAdminOrOwner, (c) => {
  try {
    securityMonitor.cleanup();

    return c.json({
      message: "Security data cleanup completed successfully",
      code: "SECURITY_CLEANUP_SUCCESS",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to cleanup security data";
    return c.json({ error: errorMessage }, 500);
  }
});

// Get system health status
monitoring.get("/health", (c) => {
  try {
    const securityStats = securityMonitor.getSecurityStats();
    const tokenStats = tokenService.getStats();

    const healthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        authentication: "operational",
        security_monitoring: "operational",
        token_management: "operational"
      },
      metrics: {
        activeAlerts: securityStats.activeAlerts,
        blacklistedTokens: tokenStats.blacklistedTokens,
        compromisedAccounts: tokenStats.compromisedAccounts,
        totalEvents: securityStats.totalEvents
      }
    };

    // Determine overall health status
    if (securityStats.activeAlerts > 10) {
      healthStatus.status = "warning";
    }
    if (securityStats.activeAlerts > 50) {
      healthStatus.status = "critical";
    }

    return c.json({
      message: "System health check completed",
      code: "HEALTH_CHECK_SUCCESS",
      data: healthStatus
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Health check failed";
    return c.json({ 
      error: errorMessage,
      status: "unhealthy",
      timestamp: new Date().toISOString()
    }, 500);
  }
});

export default monitoring; 