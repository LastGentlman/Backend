import { getSupabaseClient } from "../utils/supabase.ts";

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

interface BusinessWhatsAppConfig {
  id?: string;
  business_id: string;
  phone_numbers: string[];
  business_hours: {
    start: string;
    end: string;
    timezone: string;
  };
  escalation: {
    immediate: string[];
    delayed: string[];
    weekend: string[];
  };
  auto_responses: {
    enabled: boolean;
    templates: Record<string, string>;
  };
  created_at?: string;
  updated_at?: string;
}

interface AlertContext {
  order?: {
    client_generated_id?: string;
    total?: number;
    client_name?: string;
    delivery_date?: string;
    businesses?: {
      name?: string;
      address?: string;
    };
  };
  business?: {
    name?: string;
    address?: string;
  };
  delay?: string;
}

export class AlertRulesService {
  private static supabase = getSupabaseClient();

  /**
   * Crear reglas predeterminadas para un nuevo negocio
   */
  static async createDefaultRules(businessId: string, ownerPhone?: string): Promise<void> {
    const defaultRules: Partial<AlertRule>[] = [
      {
        business_id: businessId,
        event_type: 'new_order',
        conditions: { amount_threshold: 0 },
        actions: [{
          type: 'whatsapp',
          recipients: ownerPhone ? [ownerPhone] : [],
          template: "🆕 *Nuevo Pedido Recibido*\n\n📋 Pedido: #{{order.folio}}\n👤 Cliente: {{order.client_name}}\n💰 Total: ${{order.total}}\n📅 Entrega: {{order.delivery_date}}\n\n🏪 {{business.name}}\n\n¿Todo listo? Responde OK para confirmar."
        }],
        is_active: true
      },
      {
        business_id: businessId,
        event_type: 'order_delayed',
        conditions: { delay_hours: 2 },
        actions: [{
          type: 'whatsapp',
          recipients: ownerPhone ? [ownerPhone] : [],
          template: "⏰ *Pedido Retrasado*\n\nEl pedido #{{order.folio}} lleva {{delay}} sin atender.\n\n👤 Cliente: {{order.client_name}}\n💰 Total: ${{order.total}}\n\nPor favor revisar.",
          delay: 120 // 2 horas
        }],
        is_active: false
      }
    ];

    for (const rule of defaultRules) {
      await this.createRule(rule as AlertRule);
    }
  }

  /**
   * Crear nueva regla de alerta
   */
  static async createRule(rule: AlertRule): Promise<AlertRule> {
    const { data, error } = await this.supabase
      .from("alert_rules")
      .insert({
        ...rule,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Obtener reglas activas de un negocio
   */
  static async getActiveRules(businessId: string, eventType?: string): Promise<AlertRule[]> {
    let query = this.supabase
      .from("alert_rules")
      .select("*")
      .eq("business_id", businessId)
      .eq("is_active", true);

    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Actualizar regla de alerta
   */
  static async updateRule(ruleId: string, updates: Partial<AlertRule>): Promise<AlertRule> {
    const { data, error } = await this.supabase
      .from("alert_rules")
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq("id", ruleId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Eliminar regla de alerta
   */
  static async deleteRule(ruleId: string): Promise<void> {
    const { error } = await this.supabase
      .from("alert_rules")
      .delete()
      .eq("id", ruleId);

    if (error) throw error;
  }

  /**
   * Obtener configuración de WhatsApp de un negocio
   */
  static async getBusinessConfig(businessId: string): Promise<BusinessWhatsAppConfig | null> {
    const { data, error } = await this.supabase
      .from("business_whatsapp_config")
      .select("*")
      .eq("business_id", businessId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
    return data;
  }

  /**
   * Crear o actualizar configuración de WhatsApp
   */
  static async upsertBusinessConfig(config: BusinessWhatsAppConfig): Promise<BusinessWhatsAppConfig> {
    const { data, error } = await this.supabase
      .from("business_whatsapp_config")
      .upsert({
        ...config,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Verificar si un negocio tiene configuración de WhatsApp
   */
  static async hasWhatsAppConfig(businessId: string): Promise<boolean> {
    const config = await this.getBusinessConfig(businessId);
    return config !== null && config.phone_numbers.length > 0;
  }

  /**
   * Obtener números de teléfono para alertas de un negocio
   */
  static async getAlertPhoneNumbers(businessId: string, priority: 'immediate' | 'delayed' | 'weekend' = 'immediate'): Promise<string[]> {
    const config = await this.getBusinessConfig(businessId);
    
    if (!config) return [];
    
    switch (priority) {
      case 'immediate': {
        return config.escalation.immediate;
      }
      case 'delayed': {
        return config.escalation.delayed;
      }
      case 'weekend': {
        return config.escalation.weekend;
      }
      default: {
        return config.phone_numbers;
      }
    }
  }

  /**
   * Verificar si estamos en horario de negocio
   */
  static async isBusinessHours(businessId: string): Promise<boolean> {
    const config = await this.getBusinessConfig(businessId);
    
    if (!config) return true; // Si no hay configuración, asumir que siempre está abierto
    
    const now = new Date();
    const timezone = config.business_hours.timezone;
    
    const localTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    const currentHour = localTime.getHours();
    const currentMinute = localTime.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    
    const [startHour, startMinute] = config.business_hours.start.split(':').map(Number);
    const [endHour, endMinute] = config.business_hours.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute;
    
    return currentTime >= startTime && currentTime <= endTime;
  }

  /**
   * Verificar si es fin de semana
   */
  static isWeekend(): boolean {
    const now = new Date();
    const dayOfWeek = now.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
  }

  /**
   * Obtener estadísticas de reglas de alerta
   */
  static async getRulesStats(businessId: string): Promise<{
    total: number;
    active: number;
    byEventType: Record<string, number>;
  }> {
    const { data: rules, error } = await this.supabase
      .from("alert_rules")
      .select("event_type, is_active")
      .eq("business_id", businessId);

    if (error) throw error;

    const total = rules?.length || 0;
    const active = rules?.filter(r => r.is_active).length || 0;
    
    const byEventType: Record<string, number> = {};
    rules?.forEach(rule => {
      byEventType[rule.event_type] = (byEventType[rule.event_type] || 0) + 1;
    });

    return {
      total,
      active,
      byEventType
    };
  }

  /**
   * Ejecutar reglas para un evento específico
   */
  static async executeRulesForEvent(businessId: string, eventType: string, context: AlertContext): Promise<void> {
    const rules = await this.getActiveRules(businessId, eventType);
    
    for (const rule of rules) {
      // Verificar condiciones
      if (this.evaluateConditions(rule.conditions, context)) {
        await this.executeRule(rule, context);
      }
    }
  }

  /**
   * Evaluar condiciones de una regla
   */
  private static evaluateConditions(conditions: Record<string, string | number | boolean>, context: AlertContext): boolean {
    // Implementación básica - puedes expandir según tus necesidades
    for (const [key, value] of Object.entries(conditions)) {
      switch (key) {
        case 'amount_threshold': {
          if (context.order?.total && typeof value === 'number' && context.order.total < value) return false;
          break;
        }
        case 'delay_hours': {
          // Lógica para verificar retraso
          break;
        }
        default: {
          // Condiciones personalizadas
          break;
        }
      }
    }
    return true;
  }

  /**
   * Ejecutar una regla específica
   */
  private static async executeRule(rule: AlertRule, context: AlertContext): Promise<void> {
    for (const action of rule.actions) {
      if (action.delay) {
        // Programar para más tarde
        await this.scheduleDelayedAction(action, context, action.delay);
      } else {
        await this.executeAction(action, context);
      }
    }
  }

  /**
   * Ejecutar una acción específica
   */
  private static async executeAction(action: AlertAction, context: AlertContext): Promise<void> {
    const message = this.renderTemplate(action.template, context);
    
    switch (action.type) {
      case 'whatsapp': {
        const { WhatsAppAlertsService } = await import("./WhatsAppAlertsService.ts");
        for (const recipient of action.recipients) {
          await WhatsAppAlertsService.sendMessage(recipient, message, 'business');
        }
        break;
      }
        
      case 'push_notification': {
        // Usar tu sistema existente de push notifications
        console.log('📱 Push notification:', message);
        break;
      }
        
      case 'email': {
        // Implementar envío de email si es necesario
        console.log('📧 Email notification:', message);
        break;
      }
    }
  }

  /**
   * Renderizar template con variables
   */
  private static renderTemplate(template: string, context: AlertContext): string {
    let message = template;
    
    // Reemplazar variables del template
    message = message.replace(/\{\{order\.folio\}\}/g, context.order?.client_generated_id || '');
    message = message.replace(/\{\{order\.total\}\}/g, context.order?.total?.toString() || '');
    message = message.replace(/\{\{order\.client_name\}\}/g, context.order?.client_name || '');
    message = message.replace(/\{\{order\.delivery_date\}\}/g, context.order?.delivery_date || '');
    message = message.replace(/\{\{business\.name\}\}/g, context.order?.businesses?.name || context.business?.name || '');
    message = message.replace(/\{\{business\.address\}\}/g, context.order?.businesses?.address || context.business?.address || '');
    message = message.replace(/\{\{delay\}\}/g, context.delay || '');
    
    return message;
  }

  /**
   * Programar acción para más tarde
   */
  private static async scheduleDelayedAction(action: AlertAction, context: any, delayMinutes: number): Promise<void> {
    const executeAt = new Date();
    executeAt.setMinutes(executeAt.getMinutes() + delayMinutes);
    
    await this.supabase.from("scheduled_alerts").insert({
      action: action,
      context: context,
      execute_at: executeAt.toISOString(),
      status: "pending"
    });
  }
}
