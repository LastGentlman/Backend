import { Hono } from "hono";
import { cors } from "hono/cors";
import { smartRateLimiter } from "../utils/rateLimiter.ts";
import { EnhancedDatabaseMonitor } from "../services/EnhancedDatabaseMonitor.ts";
import { WhatsAppAlertsService } from "../services/WhatsAppAlertsService.ts";
import { getSupabaseClient } from "../utils/supabase.ts";
import type { DatabaseMetrics } from "../services/DatabaseMonitor.ts";
import { authMiddleware, requireAdminOrOwner } from "../middleware/auth.ts";
import { securityMonitor } from "../services/SecurityMonitoringService.ts";
import { tokenService } from "../services/TokenManagementService.ts";
import { logXSSAttempt } from "../utils/security.ts";
import { z } from "zod";
import { validateRequest, getValidatedData } from "../middleware/validation.ts";

const monitoring = new Hono();

// Apply CORS and rate limiting
monitoring.use("*", cors());
monitoring.use("*", smartRateLimiter());

// Apply authentication middleware to protected routes only
// Note: /security/log endpoint is excluded from authentication

const configureSchema = z.object({
  metric: z.enum(["ordersPerDay", "avgQueryTime", "databaseSize", "activeConnections", "errorRate", "syncQueueSize", "offlineUsers", "conflictCount"]),
  threshold: z.number(),
  action: z.string().min(1),
  severity: z.enum(["warning", "critical"])
});

const securityLogSchema = z.object({
  type: z.string().min(1),
  payload: z.any(),
  source: z.string().min(1),
  context: z.any(),
  timestamp: z.string().optional(),
  severity: z.string().optional()
});

const testAlertSchema = z.object({
  type: z.string().optional(),
  phoneNumber: z.string().optional()
});

const whatsappWebhookSchema = z.object({
  entry: z.array(z.object({
    changes: z.array(z.any())
  })).optional()
});

/**
 * GET /monitoring/health
 * Health check endpoint with detailed system status
 */
monitoring.get("/health", authMiddleware, async (c) => {
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
monitoring.post("/check", authMiddleware, async (c) => {
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
monitoring.post("/emergency", authMiddleware, async (c) => {
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
monitoring.get("/metrics", authMiddleware, async (c) => {
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
monitoring.get("/alerts", authMiddleware, async (c) => {
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
monitoring.post("/whatsapp/webhook", validateRequest(whatsappWebhookSchema), async (c) => {
  const body = getValidatedData<typeof whatsappWebhookSchema._type>(c);
  try {
    
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
monitoring.post("/test-alert", validateRequest(testAlertSchema), async (c) => {
  const { type = 'warning', phoneNumber: _phoneNumber } = getValidatedData<typeof testAlertSchema._type>(c);
  try {
    
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
monitoring.post("/configure", validateRequest(configureSchema), async (c) => {
  const { metric, threshold, action, severity } = getValidatedData<typeof configureSchema._type>(c);
  try {
    
    await EnhancedDatabaseMonitor.configureCustomAlerts(
      metric as keyof DatabaseMetrics,
      threshold,
      action,
      severity as "warning" | "critical"
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
monitoring.get("/security/stats", requireAdminOrOwner, async (c) => {
  try {
    const stats = securityMonitor.getSecurityStats();
    const tokenStats = await tokenService.getStatsAsync();

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

// Endpoint para recibir logs de seguridad del frontend (sin autenticación requerida)
monitoring.post("/security/log", validateRequest(securityLogSchema), (c) => {
  const logData = getValidatedData<typeof securityLogSchema._type>(c);
  try {
    
    // Validar estructura del log
    if (!logData.type || !logData.payload || !logData.source || !logData.context) {
      return c.json({ error: "Invalid log structure" }, 400);
    }
    
    // Extraer información del request
    const ip = c.req.header("x-forwarded-for") || 
               c.req.header("x-real-ip") || 
               "unknown";
    const userAgent = c.req.header("user-agent") || "unknown";
    
    // Log del intento de XSS
    if (logData.type === 'XSS_ATTEMPT_FRONTEND') {
      logXSSAttempt(
        logData.payload,
        logData.source,
        logData.context,
        ip,
        userAgent
      );
    }
    
    // Log estructurado para monitoreo
    console.log(`📊 Security Log: ${logData.type}`, {
      timestamp: logData.timestamp,
      source: logData.source,
      context: logData.context,
      ip,
      userAgent,
      severity: logData.severity || 'MEDIUM'
    });
    
    return c.json({ success: true, logged: true });
  } catch (error) {
    console.error("Error processing security log:", error);
    return c.json({ error: "Failed to process log" }, 500);
  }
});

// Endpoint para obtener estadísticas de seguridad
monitoring.get("/security/stats", (c) => {
  // En una implementación real, esto vendría de una base de datos
  // Por ahora, retornamos datos de ejemplo
  return c.json({
    xssAttempts: {
      total: 0,
      blocked: 0,
      last24h: 0
    },
    securityEvents: {
      total: 0,
      byType: {},
      bySeverity: {
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0
      }
    },
    lastUpdated: new Date().toISOString()
  });
});

// Endpoint para verificar estado de seguridad
monitoring.get("/security/health", (c) => {
  return c.json({
    status: "healthy",
    security: {
      xssProtection: "enabled",
      cspEnabled: true,
      loggingEnabled: true,
      timestamp: new Date().toISOString()
    }
  });
});

// Get system health status
monitoring.get("/health", async (c) => {
  try {
    const securityStats = securityMonitor.getSecurityStats();
    const tokenStats = await tokenService.getStatsAsync();

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
      healthStatus.status = "warning" as const;
    }
    if (securityStats.activeAlerts > 50) {
      healthStatus.status = "critical" as const;
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