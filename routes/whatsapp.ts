import { Hono } from "hono/mod.ts";

import { WhatsAppAlertsService, WhatsAppTemplates } from "../services/WhatsAppAlertsService.ts";
import { getSupabaseClient } from "../utils/supabase.ts";

const whatsapp = new Hono();

/**
 * Verificación del webhook (requerido por Meta)
 */
whatsapp.get("/webhook", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  
  const verifyToken = Deno.env.get("WEBHOOK_VERIFY_TOKEN");
  
  if (mode === "subscribe" && token === verifyToken) {
    console.log("✅ Webhook WhatsApp verificado");
    return c.text(challenge || "");
  } else {
    console.log("❌ Webhook verification failed");
    return c.text("Forbidden", 403);
  }
});

/**
 * Recibir mensajes y eventos de WhatsApp
 */
whatsapp.post("/webhook", async (c) => {
  try {
    // Verificar firma (seguridad)
    const body = await c.req.text();
    const signature = c.req.header("X-Hub-Signature-256");
    
    if (!(await verifySignature(body, signature))) {
      console.log("❌ Firma inválida");
      return c.text("Unauthorized", 401);
    }
    
    const data = JSON.parse(body);
    
    // Procesar cada entrada del webhook
    for (const entry of data.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === "messages") {
          await processIncomingMessage(change.value);
        }
      }
    }
    
    return c.text("OK", 200);
    
  } catch (error) {
    console.error("❌ Error procesando webhook WhatsApp:", error);
    return c.text("Internal Server Error", 500);
  }
});

// ===== NUEVOS ENDPOINTS PARA INTEGRACIÓN DE NEGOCIO =====

/**
 * Enviar mensaje de WhatsApp (endpoint general)
 */
whatsapp.post("/send-message", async (c) => {
  try {
    const { to, message, businessId, priority = 'business' } = await c.req.json();
    
    const result = await WhatsAppAlertsService.sendMessage(to, message, priority);
    
    // Guardar log del mensaje enviado
    if (businessId) {
      const supabase = getSupabaseClient();
      await supabase.from("whatsapp_logs").insert({
        business_id: businessId,
        phone_number: to,
        message_type: "outbound",
        content: message,
        status: result ? "sent" : "failed",
        priority: priority,
        created_at: new Date().toISOString()
      });
    }
    
    return c.json({ 
      success: result, 
      message: result ? "Mensaje enviado" : "Error enviando mensaje" 
    });
    
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

/**
 * Enviar confirmación de pedido al cliente
 */
whatsapp.post("/send-order-confirmation", async (c) => {
  try {
    const { orderId } = await c.req.json();
    
    const success = await WhatsAppAlertsService.sendOrderConfirmation(orderId);
    
    return c.json({ 
      success, 
      message: success ? "Confirmación enviada" : "Error enviando confirmación" 
    });
    
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

/**
 * Enviar notificación de pedido listo
 */
whatsapp.post("/send-order-ready", async (c) => {
  try {
    const { orderId } = await c.req.json();
    
    const success = await WhatsAppAlertsService.sendOrderReadyNotification(orderId);
    
    return c.json({ 
      success, 
      message: success ? "Notificación enviada" : "Error enviando notificación" 
    });
    
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

/**
 * Disparar alerta de nuevo pedido
 */
whatsapp.post("/trigger-new-order-alert", async (c) => {
  try {
    const { orderId } = await c.req.json();
    
    await WhatsAppAlertsService.triggerNewOrderAlert(orderId);
    
    return c.json({ 
      success: true, 
      message: "Alerta de nuevo pedido disparada" 
    });
    
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

/**
 * Verificar pedidos retrasados
 */
whatsapp.post("/check-delayed-orders", async (c) => {
  try {
    await WhatsAppAlertsService.checkDelayedOrders();
    
    return c.json({ 
      success: true, 
      message: "Verificación de pedidos retrasados completada" 
    });
    
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

// ===== GESTIÓN DE REGLAS DE ALERTA =====

/**
 * Obtener reglas de alerta de un negocio
 */
whatsapp.get("/alert-rules/:businessId", async (c) => {
  try {
    const businessId = c.req.param("businessId");
    const supabase = getSupabaseClient();
    
    const { data: rules, error } = await supabase
      .from("alert_rules")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    
    return c.json({ 
      success: true, 
      rules: rules || [] 
    });
    
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

/**
 * Crear nueva regla de alerta
 */
whatsapp.post("/alert-rules", async (c) => {
  try {
    const { business_id, event_type, conditions, actions, is_active = true } = await c.req.json();
    
    const supabase = getSupabaseClient();
    
    const { data: rule, error } = await supabase
      .from("alert_rules")
      .insert({
        business_id,
        event_type,
        conditions,
        actions,
        is_active,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return c.json({ 
      success: true, 
      rule,
      message: "Regla de alerta creada" 
    });
    
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

/**
 * Actualizar regla de alerta
 */
whatsapp.put("/alert-rules/:ruleId", async (c) => {
  try {
    const ruleId = c.req.param("ruleId");
    const updates = await c.req.json();
    
    const supabase = getSupabaseClient();
    
    const { data: rule, error } = await supabase
      .from("alert_rules")
      .update(updates)
      .eq("id", ruleId)
      .select()
      .single();
    
    if (error) throw error;
    
    return c.json({ 
      success: true, 
      rule,
      message: "Regla de alerta actualizada" 
    });
    
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

/**
 * Eliminar regla de alerta
 */
whatsapp.delete("/alert-rules/:ruleId", async (c) => {
  try {
    const ruleId = c.req.param("ruleId");
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from("alert_rules")
      .delete()
      .eq("id", ruleId);
    
    if (error) throw error;
    
    return c.json({ 
      success: true, 
      message: "Regla de alerta eliminada" 
    });
    
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

// ===== ANALYTICS Y REPORTES =====

/**
 * Obtener analytics de WhatsApp para un negocio
 */
whatsapp.get("/analytics/:businessId", async (c) => {
  try {
    const businessId = c.req.param("businessId");
    const period = c.req.query("period") || "week";
    
    const analytics = await WhatsAppAlertsService.getWhatsAppAnalytics(businessId, period);
    
    return c.json({ 
      success: true, 
      analytics 
    });
    
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

/**
 * Obtener logs de WhatsApp de un negocio
 */
whatsapp.get("/logs/:businessId", async (c) => {
  try {
    const businessId = c.req.param("businessId");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");
    
    const supabase = getSupabaseClient();
    
    const { data: logs, error } = await supabase
      .from("whatsapp_logs")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw error;
    
    return c.json({ 
      success: true, 
      logs: logs || [],
      pagination: {
        limit,
        offset,
        hasMore: (logs || []).length === limit
      }
    });
    
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

// ===== TEMPLATES Y CONFIGURACIÓN =====

/**
 * Obtener templates disponibles
 */
whatsapp.get("/templates", (c) => {
  return c.json({ 
    success: true, 
    templates: WhatsAppTemplates 
  });
});

/**
 * Endpoint para enviar alerta manual (útil para testing)
 */
whatsapp.post("/send-test-alert", async (c) => {
  try {
    const { phoneNumber, message, priority } = await c.req.json();
    
    const success = await WhatsAppAlertsService.sendMessage(
      phoneNumber,
      message,
      priority || 'warning'
    );
    
    return c.json({ 
      success, 
      message: success ? "Mensaje enviado" : "Error enviando mensaje" 
    });
    
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

/**
 * Endpoint para configurar números de alerta
 */
whatsapp.post("/configure-alerts", async (c) => {
  try {
    const { phoneNumbers, escalation } = await c.req.json();
    
    // Aquí podrías guardar la configuración en BD
    // Por simplicidad, lo logueamos
    console.log("📱 Configuración de alertas actualizada:", {
      phoneNumbers,
      escalation
    });
    
    return c.json({ 
      success: true, 
      message: "Configuración actualizada" 
    });
    
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

// ===== MÉTODOS PRIVADOS (MANTENIDOS) =====

/**
 * Verifica la firma del webhook para seguridad
 */
async function verifySignature(body: string, signature?: string): Promise<boolean> {
  if (!signature) return false;
  
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret) return false;
  
  // Usar Web Crypto API de Deno
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  const receivedSignature = signature.replace("sha256=", "");
  
  return expectedSignature === receivedSignature;
}

/**
 * Procesa mensajes entrantes de WhatsApp
 */
async function processIncomingMessage(messageData: Record<string, unknown>): Promise<void> {
  try {
    const messages = messageData.messages || [];
    
    for (const message of messages as Record<string, unknown>[]) {
      const fromNumber = message.from;
      const messageType = message.type;
      
      // Solo procesar mensajes de texto
      if (messageType === "text") {
        const messageText = (message.text as { body: string }).body;
        
        console.log(`📱 Mensaje recibido de ${fromNumber}: ${messageText}`);
        
        // Manejar comandos
        await WhatsAppAlertsService.handleIncomingMessage(
          fromNumber as string, 
          messageText
        );
      }
    }
    
  } catch (error) {
    console.error("❌ Error procesando mensaje entrante:", error);
  }
}

export default whatsapp; 