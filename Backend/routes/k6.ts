import { Hono } from "hono";
import { getSupabaseClient } from "../utils/supabase.ts";
import { errorLogger } from "../utils/logger.ts";
import { WhatsAppAlertsService } from "../services/WhatsAppAlertsService.ts";

const k6 = new Hono();

/**
 * POST /k6/summary
 * Recibe el resumen de un test de K6, guarda en la base y dispara alertas si es necesario
 */
k6.post("/summary", async (c) => {
  try {
    const summary = await c.req.json();
    const supabase = getSupabaseClient();

    // Guardar métricas en la tabla k6_metrics
    const { error } = await supabase.from("k6_metrics").insert([
      {
        test_type: summary.test_type || "health_check",
        metrics: summary.metrics,
        thresholds_passed: summary.thresholds_passed ?? true,
        test_duration: summary.test_duration,
        virtual_users: summary.virtual_users,
        iterations: summary.iterations,
        data_sent: summary.data_sent,
        data_received: summary.data_received,
        timestamp: new Date().toISOString(),
      },
    ]);

    if (error) {
      errorLogger(error, "K6 Webhook: Insert k6_metrics");
      return c.text("Error saving metrics", 500);
    }

    // Verificar umbrales y disparar alertas
    const alerts = [];
    if (summary.metrics?.http_req_duration_p95 > 3000) {
      alerts.push({
        severity: "warning",
        title: "High Response Time",
        message: `P95 response time: ${summary.metrics.http_req_duration_p95}ms`,
        action_required: "Optimize slow endpoints",
      });
    }
    if (summary.metrics?.http_req_failed_rate > 0.05) {
      alerts.push({
        severity: "critical",
        title: "High Error Rate",
        message: `Error rate: ${(summary.metrics.http_req_failed_rate * 100).toFixed(2)}%`,
        action_required: "Investigate and fix failing endpoints",
      });
    }

    for (const alert of alerts) {
      if (alert.severity === "critical") {
        await WhatsAppAlertsService.sendCriticalAlert(
          alert.title,
          summary.metrics?.http_req_failed_rate,
          0.05,
          alert.message + "\n" + alert.action_required
        );
      } else if (alert.severity === "warning") {
        await WhatsAppAlertsService.sendWarningAlert(
          alert.title,
          summary.metrics?.http_req_duration_p95,
          3000,
          alert.message + "\n" + alert.action_required
        );
      }
    }

    return c.text("OK", 200);
  } catch (error) {
    errorLogger(error, "K6 Webhook: /summary");
    return c.text("Error", 500);
  }
});

export default k6;
