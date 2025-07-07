import { Hono } from "hono";

import { WhatsAppAlertsService } from "../services/WhatsAppAlertsService.ts";

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
async function processIncomingMessage(messageData: any): Promise<void> {
  try {
    const messages = messageData.messages || [];
    
    for (const message of messages) {
      const fromNumber = message.from;
      const messageType = message.type;
      
      // Solo procesar mensajes de texto
      if (messageType === "text") {
        const messageText = message.text.body;
        
        console.log(`📱 Mensaje recibido de ${fromNumber}: ${messageText}`);
        
        // Manejar comandos
        await WhatsAppAlertsService.handleIncomingMessage(
          fromNumber, 
          messageText
        );
      }
    }
    
  } catch (error) {
    console.error("❌ Error procesando mensaje entrante:", error);
  }
}

export default whatsapp; 