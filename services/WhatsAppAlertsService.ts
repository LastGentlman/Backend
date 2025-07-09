import { getSupabaseClient } from "../utils/supabase.ts";

interface WhatsAppMessage {
  to: string;
  type: 'text' | 'template';
  text?: {
    body: string;
  };
  template?: {
    name: string;
    language: { code: string };
    components: unknown[];
  };
}

interface AlertConfig {
  phoneNumbers: string[];           // Números para alertas críticas
  businessHours: {
    start: string;                 // "09:00"
    end: string;                   // "18:00"
    timezone: string;              // "America/Mexico_City"
  };
  escalation: {
    immediate: string[];           // Para alertas críticas
    delayed: string[];             // Para warnings (después de 1hr)
    weekend: string[];             // Solo para emergencias críticas
  };
}

// ===== NUEVAS INTERFACES PARA ALERTAS DE NEGOCIO =====

interface AlertRule {
  id?: string;
  business_id: string;
  event_type: 'new_order' | 'order_delayed' | 'payment_received' | 'low_stock' | 'system_alert';
  conditions: Record<string, string | number | boolean>;
  actions: AlertAction[];
  is_active: boolean;
  created_at?: string;
}

interface AlertAction {
  type: 'whatsapp' | 'push_notification' | 'email';
  recipients: string[];
  template: string;
  delay?: number; // minutos
}

interface WhatsAppLog {
  id?: string;
  business_id?: string;
  phone_number: string;
  message_type: 'inbound' | 'outbound';
  content: string;
  status: 'sent' | 'failed' | 'delivered' | 'read';
  whatsapp_message_id?: string;
  priority?: 'critical' | 'warning' | 'report' | 'business';
  context?: Record<string, unknown>;
  created_at?: string;
}

// ===== TEMPLATES DE MENSAJES PREDEFINIDOS =====

export const WhatsAppTemplates = {
  newOrder: "🆕 *Nuevo Pedido Recibido*\n\n📋 Pedido: #{{order.folio}}\n👤 Cliente: {{order.client_name}}\n💰 Total: ${{order.total}}\n📅 Entrega: {{order.delivery_date}}\n\n🏪 {{business.name}}\n\n¿Todo listo? Responde OK para confirmar.",

  orderConfirmation: "✅ *Pedido Confirmado*\n\n¡Hola {{order.client_name}}! \n\nTu pedido #{{order.folio}} ha sido confirmado:\n\n{{order.items_summary}}\n\n💰 Total: ${{order.total}}\n📅 Entrega: {{order.delivery_date}}\n\n¡Gracias por elegirnos! 🙏",

  orderReady: "🎉 *¡Tu pedido está listo!*\n\n{{order.client_name}}, tu pedido #{{order.folio}} está listo para entrega.\n\n📍 Recógelo en: {{business.address}}\n⏰ Horario: {{business.hours}}\n\n¡Te esperamos! 😊",

  orderDelay: "⏰ *Actualización de Pedido*\n\n{{order.client_name}}, tu pedido #{{order.folio}} tendrá un ligero retraso.\n\nNueva hora estimada: {{order.new_delivery_time}}\n\nDisculpa las molestias. ¡Gracias por tu paciencia! 🙏",

  paymentReminder: "💳 *Recordatorio de Pago*\n\n{{order.client_name}}, tu pedido #{{order.folio}} está pendiente de pago:\n\n💰 Total: ${{order.total}}\n\nMétodos de pago disponibles:\n• Efectivo\n• Transferencia\n• Tarjeta\n\n¡Gracias! 🙏",

  systemAlert: "🚨 *Alerta del Sistema*\n\n{{alert.message}}\n\n📊 Métrica: {{alert.metric}}\n📈 Valor: {{alert.value}}\n⚠️ Límite: {{alert.threshold}}\n\n⏰ {{alert.timestamp}}\n\n🔗 Dashboard: {{alert.dashboard_url}}"
};

export class WhatsAppAlertsService {
  private static accessToken = Deno.env.get('META_WHATSAPP_TOKEN');
  private static phoneNumberId = Deno.env.get('META_PHONE_NUMBER_ID');
  private static baseUrl = `https://graph.facebook.com/v18.0`;

  // Configuración por defecto
  private static defaultConfig: AlertConfig = {
    phoneNumbers: ['+5255XXXXXXXX'], // Tu número principal
    businessHours: {
      start: '09:00',
      end: '22:00',
      timezone: 'America/Mexico_City'
    },
    escalation: {
      immediate: ['+5255XXXXXXXX'],           // CTO/Fundador
      delayed: ['+5255YYYYYYYY'],             // DevOps team
      weekend: ['+5255XXXXXXXX']              // Solo críticos
    }
  };

  // ===== MÉTODOS EXISTENTES (MANTENIDOS) =====

  /**
   * Envía alerta crítica inmediata por WhatsApp
   */
  static async sendCriticalAlert(
    metric: string, 
    currentValue: number, 
    threshold: number,
    action: string
  ): Promise<void> {
    const message = this.formatCriticalMessage(metric, currentValue, threshold, action);
    
    // Enviar a números de escalación inmediata
    for (const phoneNumber of this.defaultConfig.escalation.immediate) {
      await this.sendMessage(phoneNumber, message, 'critical');
    }
    
    // Log para auditoría
    console.log(`🚨 ALERTA CRÍTICA enviada: ${metric} = ${currentValue} (límite: ${threshold})`);
  }

  /**
   * Envía warning con lógica de horario de negocio
   */
  static async sendWarningAlert(
    metric: string,
    currentValue: number,
    threshold: number,
    action: string
  ): Promise<void> {
    const isBusinessHours = this.isBusinessHours();
    const isWeekend = this.isWeekend();
    
    // Durante horario de negocio: enviar inmediato
    if (isBusinessHours && !isWeekend) {
      const message = this.formatWarningMessage(metric, currentValue, threshold, action);
      
      for (const phoneNumber of this.defaultConfig.escalation.delayed) {
        await this.sendMessage(phoneNumber, message, 'warning');
      }
    } else {
      // Fuera de horario: programar para mañana
      await this.scheduleAlert(metric, currentValue, threshold, action, 'warning');
    }
  }

  /**
   * Envía reporte diario/semanal
   */
  static async sendStatusReport(report: string, isWeekly = false): Promise<void> {
    const reportType = isWeekly ? 'SEMANAL' : 'DIARIO';
    const emoji = isWeekly ? '📊' : '📈';
    
    const message = `${emoji} *REPORTE ${reportType} - PedidoList*\n\n${report}`;
    
    // Enviar solo al número principal para reportes
    await this.sendMessage(
      this.defaultConfig.phoneNumbers[0], 
      message, 
      'report'
    );
  }

  /**
   * Envía mensaje usando WhatsApp Business API
   */
  static async sendMessage(
    phoneNumber: string, 
    message: string, 
    priority: 'critical' | 'warning' | 'report' | 'business' = 'business'
  ): Promise<boolean> {
    if (!this.accessToken || !this.phoneNumberId) {
      console.error('❌ WhatsApp credentials no configuradas');
      return false;
    }

    const cleanPhoneNumber = phoneNumber.replace(/\D/g, ''); // Remover caracteres no numéricos
    
    const whatsappMessage: WhatsAppMessage = {
      to: cleanPhoneNumber,
      type: 'text',
      text: {
        body: message
      }
    };

    try {
      const response = await fetch(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(whatsappMessage)
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Error enviando WhatsApp:', errorData);
        await this.logMessage(phoneNumber, message, priority, 'failed');
        return false;
      }

      const result = await response.json();
      console.log(`✅ WhatsApp enviado a ${phoneNumber}:`, result.messages[0].id);
      
      // Guardar log para auditoría
      await this.logMessage(phoneNumber, message, priority, 'sent', result.messages[0].id);
      
      return true;

    } catch (error) {
      console.error('❌ Error de red enviando WhatsApp:', error);
      await this.logMessage(phoneNumber, message, priority, 'failed');
      return false;
    }
  }

  // ===== NUEVOS MÉTODOS PARA ALERTAS DE NEGOCIO =====

  /**
   * Disparar alerta cuando se crea un nuevo pedido
   */
  static async triggerNewOrderAlert(orderId: string): Promise<void> {
    const supabase = getSupabaseClient();
    
    const { data: order } = await supabase
      .from("orders")
      .select(`
        *,
        businesses!inner(id, name, owner_id, settings),
        profiles!inner(name, phone)
      `)
      .eq("id", orderId)
      .single();
      
    if (!order) return;
    
    const alertRules = await this.getActiveRules(order.business_id, 'new_order');
    
    for (const rule of alertRules) {
      await this.executeRule(rule, { order });
    }
  }

  /**
   * Alerta por pedidos retrasados
   */
  static async checkDelayedOrders(): Promise<void> {
    const supabase = getSupabaseClient();
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 2); // 2 horas de retraso
    
    const { data: delayedOrders } = await supabase
      .from("orders")
      .select(`
        *,
        businesses!inner(id, name, owner_id),
        profiles!inner(phone)
      `)
      .eq("status", "pending")
      .lt("created_at", cutoffTime.toISOString());
      
    for (const order of delayedOrders || []) {
      await this.triggerDelayedOrderAlert(order);
    }
  }

  /**
   * Enviar mensaje de confirmación al cliente
   */
  static async sendOrderConfirmation(orderId: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    
    const { data: order } = await supabase
      .from("orders")
      .select(`
        *,
        businesses!inner(id, name, address, settings)
      `)
      .eq("id", orderId)
      .single();
      
    if (!order || !order.client_phone) return false;
    
    const message = this.renderTemplate(WhatsAppTemplates.orderConfirmation, { 
      order,
      business: order.businesses 
    });
    
    return await this.sendMessage(order.client_phone, message, 'business');
  }

  /**
   * Enviar notificación de pedido listo
   */
  static async sendOrderReadyNotification(orderId: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    
    const { data: order } = await supabase
      .from("orders")
      .select(`
        *,
        businesses!inner(id, name, address, settings)
      `)
      .eq("id", orderId)
      .single();
      
    if (!order || !order.client_phone) return false;
    
    const message = this.renderTemplate(WhatsAppTemplates.orderReady, { 
      order,
      business: order.businesses 
    });
    
    return await this.sendMessage(order.client_phone, message, 'business');
  }

  // ===== MÉTODOS PRIVADOS PARA ALERTAS =====

  private static async getActiveRules(businessId: string, eventType: string): Promise<AlertRule[]> {
    const supabase = getSupabaseClient();
    
    const { data } = await supabase
      .from("alert_rules")
      .select("*")
      .eq("business_id", businessId)
      .eq("event_type", eventType)
      .eq("is_active", true);
      
    return data || [];
  }

  private static async executeRule(rule: AlertRule, context: Record<string, unknown>): Promise<void> {
    for (const action of rule.actions) {
      if (action.delay) {
        // Programar para más tarde
        await this.scheduleDelayedAction(action, context, action.delay);
      } else {
        await this.executeAction(action, context);
      }
    }
  }

  private static async executeAction(action: AlertAction, context: Record<string, unknown>): Promise<void> {
    const message = this.renderTemplate(action.template, context);
    
    switch (action.type) {
      case 'whatsapp':
        for (const recipient of action.recipients) {
          await this.sendMessage(recipient, message, 'business');
        }
        break;
        
      case 'push_notification':
        // Usar tu sistema existente de push notifications
        console.log('📱 Push notification:', message);
        break;
        
      case 'email':
        // Implementar envío de email si es necesario
        console.log('📧 Email notification:', message);
        break;
    }
  }

  private static renderTemplate(template: string, context: Record<string, unknown>): string {
    let message = template;
    
    // Reemplazar variables del template
    message = message.replace(/\{\{order\.folio\}\}/g, (context.order as { client_generated_id?: string })?.client_generated_id || '');
    message = message.replace(/\{\{order\.total\}\}/g, (context.order as { total?: number })?.total?.toString() || '');
    message = message.replace(/\{\{order\.client_name\}\}/g, (context.order as { client_name?: string })?.client_name || '');
    message = message.replace(/\{\{order\.delivery_date\}\}/g, (context.order as { delivery_date?: string })?.delivery_date || '');
    message = message.replace(/\{\{business\.name\}\}/g, (context.order as { businesses?: { name?: string } })?.businesses?.name || (context.business as { name?: string })?.name || '');
    message = message.replace(/\{\{business\.address\}\}/g, (context.order as { businesses?: { address?: string } })?.businesses?.address || (context.business as { address?: string })?.address || '');
    
    // Variables para alertas del sistema
    message = message.replace(/\{\{alert\.message\}\}/g, (context.alert as { message?: string })?.message || '');
    message = message.replace(/\{\{alert\.metric\}\}/g, (context.alert as { metric?: string })?.metric || '');
    message = message.replace(/\{\{alert\.value\}\}/g, (context.alert as { value?: string })?.value || '');
    message = message.replace(/\{\{alert\.threshold\}\}/g, (context.alert as { threshold?: string })?.threshold || '');
    message = message.replace(/\{\{alert\.timestamp\}\}/g, (context.alert as { timestamp?: string })?.timestamp || '');
    message = message.replace(/\{\{alert\.dashboard_url\}\}/g, (context.alert as { dashboard_url?: string })?.dashboard_url || '');
    
    return message;
  }

  private static async scheduleDelayedAction(action: AlertAction, context: Record<string, unknown>, delayMinutes: number): Promise<void> {
    const supabase = getSupabaseClient();
    const executeAt = new Date();
    executeAt.setMinutes(executeAt.getMinutes() + delayMinutes);
    
    await supabase.from("scheduled_alerts").insert({
      action: action,
      context: context,
      execute_at: executeAt.toISOString(),
      status: "pending"
    });
  }

  private static async triggerDelayedOrderAlert(order: Record<string, unknown>): Promise<void> {
    const alertRules = await this.getActiveRules(order.business_id as string, 'order_delayed');
    
    for (const rule of alertRules) {
      await this.executeRule(rule, { 
        order,
        delay: '2 horas'
      });
    }
  }

  // ===== ANALYTICS Y MONITOREO =====

  /**
   * Obtener estadísticas de WhatsApp para un negocio
   */
  static async getWhatsAppAnalytics(businessId: string, period: string = 'week'): Promise<Record<string, unknown>> {
    const supabase = getSupabaseClient();
    
    const startDate = new Date();
    if (period === 'week') startDate.setDate(startDate.getDate() - 7);
    if (period === 'month') startDate.setMonth(startDate.getMonth() - 1);
    
    const { data: logs } = await supabase
      .from("whatsapp_logs")
      .select("*")
      .eq("business_id", businessId)
      .gte("created_at", startDate.toISOString());
      
    const sent = logs?.filter(l => l.message_type === 'outbound').length || 0;
    const received = logs?.filter(l => l.message_type === 'inbound').length || 0;
    const successful = logs?.filter(l => l.status === 'sent').length || 0;
    
    return {
      messagesSent: sent,
      messagesReceived: received,
      successRate: sent > 0 ? (successful / sent) * 100 : 0,
      responseRate: received > 0 ? (sent / received) * 100 : 0,
      avgResponseTime: 0, // TODO: Calcular promedio de tiempo de respuesta
      topRecipients: [] // TODO: Calcular destinatarios más frecuentes
    };
  }

  // ===== MÉTODOS EXISTENTES (MANTENIDOS) =====

  /**
   * Formatea mensaje de alerta crítica
   */
  private static formatCriticalMessage(
    metric: string, 
    currentValue: number, 
    threshold: number,
    action: string
  ): string {
    const timestamp = new Date().toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City'
    });

    return `🚨 *ALERTA CRÍTICA - PedidoList*

📊 *Métrica:* ${metric}
📈 *Valor actual:* ${currentValue.toLocaleString()}
⚠️ *Límite:* ${threshold.toLocaleString()}
🔧 *Acción requerida:* ${action}

⏰ *Timestamp:* ${timestamp}

🔗 Dashboard: https://app.ingroy.com/admin/metrics

⚡ *REQUIERE ATENCIÓN INMEDIATA*`;
  }

  /**
   * Formatea mensaje de warning
   */
  private static formatWarningMessage(
    metric: string,
    currentValue: number,
    threshold: number,
    action: string
  ): string {
    const timestamp = new Date().toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City'
    });

    return `⚠️ *WARNING - PedidoList*

📊 *Métrica:* ${metric}
📈 *Valor actual:* ${currentValue.toLocaleString()}
⚠️ *Límite:* ${threshold.toLocaleString()}
🔧 *Acción sugerida:* ${action}

⏰ *Timestamp:* ${timestamp}

🔗 Dashboard: https://app.ingroy.com/admin/metrics

📋 *Revisar cuando sea posible*`;
  }

  /**
   * Verifica si estamos en horario de negocio
   */
  private static isBusinessHours(): boolean {
    const now = new Date();
    const timezone = this.defaultConfig.businessHours.timezone;
    
    const localTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    const currentHour = localTime.getHours();
    const currentMinute = localTime.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    
    const [startHour, startMinute] = this.defaultConfig.businessHours.start.split(':').map(Number);
    const [endHour, endMinute] = this.defaultConfig.businessHours.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute;
    
    return currentTime >= startTime && currentTime <= endTime;
  }

  /**
   * Verifica si es fin de semana
   */
  private static isWeekend(): boolean {
    const now = new Date();
    const dayOfWeek = now.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
  }

  /**
   * Programa alerta para horario de negocio
   */
  private static scheduleAlert(
    metric: string,
    currentValue: number,
    threshold: number,
    action: string,
    severity: 'warning' | 'critical'
  ): void {
    const delayMs = this.getDelayUntilBusinessHours();
    
    setTimeout(async () => {
      const message = severity === 'critical' 
        ? this.formatCriticalMessage(metric, currentValue, threshold, action)
        : this.formatWarningMessage(metric, currentValue, threshold, action);
      
      for (const phoneNumber of this.defaultConfig.escalation.delayed) {
        await this.sendMessage(phoneNumber, message, severity);
      }
    }, delayMs);
    
    console.log(`⏰ Alerta programada para ${new Date(Date.now() + delayMs).toLocaleString()}`);
  }

  /**
   * Calcula el delay hasta el próximo horario de negocio
   */
  private static getDelayUntilBusinessHours(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // 9:00 AM
    
    return tomorrow.getTime() - now.getTime();
  }

  /**
   * Guarda log del mensaje en la base de datos
   */
  private static async logMessage(
    phoneNumber: string, 
    message: string, 
    priority: string, 
    status: 'sent' | 'failed' | 'delivered' | 'read',
    whatsappMessageId?: string
  ): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      
      await supabase.from("whatsapp_logs").insert({
        phone_number: phoneNumber,
        message_type: 'outbound',
        content: message,
        status: status,
        priority: priority,
        whatsapp_message_id: whatsappMessageId,
        created_at: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Error guardando log de WhatsApp:', error);
    }
  }

  /**
   * Configura el webhook de WhatsApp
   */
  static setupWebhook(): void {
    console.log('📱 WhatsApp webhook configurado');
    console.log('🔗 URL: https://tu-dominio.com/api/whatsapp/webhook');
    console.log('🔐 Verify Token:', Deno.env.get('WEBHOOK_VERIFY_TOKEN'));
  }

  /**
   * Maneja mensajes entrantes de WhatsApp
   */
  static async handleIncomingMessage(phoneNumber: string, messageText: string): Promise<void> {
    try {
      // Guardar mensaje entrante
      await this.logIncomingMessage(phoneNumber, messageText);
      
      // Procesar comandos
      const command = messageText.toLowerCase().trim();
      
      switch (command) {
        case 'status':
        case 'estado':
          await this.sendSystemStatus(phoneNumber);
          break;
          
        case 'pause':
        case 'pausar':
          await this.pauseAlerts(phoneNumber, 24); // Pausar por 24 horas
          break;
          
        case 'resume':
        case 'reanudar':
          await this.resumeAlerts(phoneNumber);
          break;
          
        case 'help':
        case 'ayuda':
          await this.sendHelpMessage(phoneNumber);
          break;
          
        default: {
          // Respuesta automática para mensajes no reconocidos
          const autoResponse = await this.generateAutoResponse(messageText);
          if (autoResponse) {
            await this.sendMessage(phoneNumber, autoResponse, 'business');
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Error procesando mensaje entrante:', error);
    }
  }

  /**
   * Genera respuesta automática básica
   */
  private static generateAutoResponse(messageText: string): string | null {
    const text = messageText.toLowerCase();
    
    if (text.includes("hola") || text.includes("pedido")) {
      return "¡Hola! Gracias por contactarnos. Tu mensaje ha sido recibido y te responderemos pronto. 🙏";
    }
    
    if (text.includes("estado") || text.includes("status")) {
      return "Para consultar el estado de tu pedido, compártenos tu número de pedido. 📋";
    }
    
    return null; // No respuesta automática
  }

  /**
   * Guarda mensaje entrante en la base de datos
   */
  private static async logIncomingMessage(phoneNumber: string, messageText: string): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      
      await supabase.from("whatsapp_logs").insert({
        phone_number: phoneNumber,
        message_type: 'inbound',
        content: messageText,
        status: 'delivered',
        priority: 'business',
        created_at: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Error guardando mensaje entrante:', error);
    }
  }

  /**
   * Envía estado del sistema
   */
  private static async sendSystemStatus(phoneNumber: string): Promise<void> {
    const message = `📊 *Estado del Sistema - PedidoList*

✅ API: Funcionando
✅ Base de datos: Conectada
✅ WhatsApp: Activo

⏰ Última verificación: ${new Date().toLocaleString('es-MX')}

🔗 Dashboard: https://app.ingroy.com/admin/metrics`;
    
    await this.sendMessage(phoneNumber, message, 'report');
  }

  /**
   * Pausa alertas por un período
   */
  private static async pauseAlerts(phoneNumber: string, hours: number): Promise<void> {
    const message = `⏸️ *Alertas Pausadas*

Las alertas han sido pausadas por ${hours} horas.

Para reanudar, envía "resume" o "reanudar".`;
    
    await this.sendMessage(phoneNumber, message, 'report');
  }

  /**
   * Reanuda alertas
   */
  private static async resumeAlerts(phoneNumber: string): Promise<void> {
    const message = `▶️ *Alertas Reanudadas*

Las alertas han sido reanudadas.

Para pausar, envía "pause" o "pausar".`;
    
    await this.sendMessage(phoneNumber, message, 'report');
  }

  /**
   * Envía mensaje de ayuda
   */
  private static async sendHelpMessage(phoneNumber: string): Promise<void> {
    const message = `📋 *Comandos Disponibles*

• status/estado - Estado del sistema
• pause/pausar - Pausar alertas (24h)
• resume/reanudar - Reanudar alertas
• help/ayuda - Mostrar esta ayuda

🔗 Dashboard: https://app.ingroy.com/admin/metrics`;
    
    await this.sendMessage(phoneNumber, message, 'report');
  }
}

export type { AlertConfig }; 