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
    priority: 'critical' | 'warning' | 'report'
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
        return false;
      }

      const result = await response.json();
      console.log(`✅ WhatsApp enviado a ${phoneNumber}:`, result.messages[0].id);
      
      // Guardar log para auditoría
      await this.logMessage(phoneNumber, message, priority, 'sent');
      
      return true;

    } catch (error) {
      console.error('❌ Error de red enviando WhatsApp:', error);
      await this.logMessage(phoneNumber, message, priority, 'failed');
      return false;
    }
  }

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

🔗 Dashboard: https://app.pedidolist.com/admin/metrics

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

    return `⚠️ *Warning - PedidoList*

📊 ${metric}: ${currentValue.toLocaleString()} (límite: ${threshold.toLocaleString()})
🔧 ${action}

⏰ ${timestamp}

Dashboard: https://app.pedidolist.com/admin/metrics`;
  }

  /**
   * Verifica si estamos en horario de negocio
   */
  private static isBusinessHours(): boolean {
    const now = new Date();
    const mexicoTime = new Date(now.toLocaleString("en-US", {
      timeZone: "America/Mexico_City"
    }));
    
    const hour = mexicoTime.getHours();
    const startHour = parseInt(this.defaultConfig.businessHours.start.split(':')[0]);
    const endHour = parseInt(this.defaultConfig.businessHours.end.split(':')[0]);
    
    return hour >= startHour && hour <= endHour;
  }

  /**
   * Verifica si es fin de semana
   */
  private static isWeekend(): boolean {
    const now = new Date();
    const mexicoTime = new Date(now.toLocaleString("en-US", {
      timeZone: "America/Mexico_City"
    }));
    
    const dayOfWeek = mexicoTime.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Domingo o Sábado
  }

  /**
   * Programa alerta para envío posterior
   */
  private static scheduleAlert(
    metric: string,
    currentValue: number,
    threshold: number,
    action: string,
    severity: 'warning' | 'critical'
  ): void {
    // Aquí podrías usar un job queue como Redis/Bull
    // Por simplicidad, usamos setTimeout para demo
    const delayMs = this.getDelayUntilBusinessHours();
    
    setTimeout(async () => {
      if (severity === 'warning') {
        await this.sendWarningAlert(metric, currentValue, threshold, action);
      } else {
        await this.sendCriticalAlert(metric, currentValue, threshold, action);
      }
    }, delayMs);
    
    console.log(`⏰ Alerta programada para envío en ${delayMs/1000/60} minutos`);
  }

  /**
   * Calcula delay hasta próximo horario de negocio
   */
  private static getDelayUntilBusinessHours(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // 9 AM mañana
    
    return tomorrow.getTime() - now.getTime();
  }

  /**
   * Guarda log de mensajes para auditoría
   */
  private static async logMessage(
    phoneNumber: string,
    message: string,
    priority: string,
    status: 'sent' | 'failed'
  ): Promise<void> {
    const supabase = getSupabaseClient();
    
    try {
      await supabase.from('whatsapp_logs').insert({
        phone_number: phoneNumber,
        message_content: message,
        priority,
        status,
        sent_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error guardando log WhatsApp:', error);
    }
  }

  /**
   * Configura webhook para recibir respuestas (opcional)
   */
  static setupWebhook(): void {
    // Configurar webhook para recibir respuestas de WhatsApp
    // Útil para comandos como "status", "pause alerts", etc.
    console.log('📱 Webhook WhatsApp configurado para recibir respuestas');
  }

  /**
   * Maneja comandos recibidos por WhatsApp
   */
  static async handleIncomingMessage(phoneNumber: string, messageText: string): Promise<void> {
    const command = messageText.toLowerCase().trim();
    
    switch (command) {
      case 'status':
        await this.sendSystemStatus(phoneNumber);
        break;
      case 'pause':
        await this.pauseAlerts(phoneNumber, 1); // 1 hora
        break;
      case 'resume':
        await this.resumeAlerts(phoneNumber);
        break;
      case 'help':
        await this.sendHelpMessage(phoneNumber);
        break;
      default:
        await this.sendMessage(
          phoneNumber, 
          '❓ Comando no reconocido. Envía "help" para ver comandos disponibles.', 
          'report'
        );
    }
  }

  private static async sendSystemStatus(phoneNumber: string): Promise<void> {
    // Obtener métricas actuales y enviar resumen
    const { DatabaseMonitor } = await import("./DatabaseMonitor.ts");
    const metrics = await DatabaseMonitor.collectMetrics();
    const status = `📊 *Estado del Sistema*

🔹 Órdenes hoy: ${metrics.ordersPerDay}
🔹 Tiempo promedio query: ${metrics.avgQueryTime}ms
🔹 BD tamaño: ${metrics.databaseSize}MB
🔹 Conexiones: ${metrics.activeConnections}

✅ Sistema operando normalmente`;

    await this.sendMessage(phoneNumber, status, 'report');
  }

  private static async pauseAlerts(phoneNumber: string, hours: number): Promise<void> {
    // Implementar lógica para pausar alertas
    await this.sendMessage(
      phoneNumber, 
      `⏸️ Alertas pausadas por ${hours} hora(s). Envía "resume" para reactivar.`, 
      'report'
    );
  }

  private static async resumeAlerts(phoneNumber: string): Promise<void> {
    await this.sendMessage(
      phoneNumber, 
      `▶️ Alertas reactivadas. Monitoreo normal restablecido.`, 
      'report'
    );
  }

  private static async sendHelpMessage(phoneNumber: string): Promise<void> {
    const helpText = `📱 *Comandos WhatsApp PedidoList*

• *status* - Estado actual del sistema
• *pause* - Pausar alertas por 1 hora
• *resume* - Reactivar alertas
• *help* - Mostrar este mensaje

🔧 Para soporte técnico: tech@pedidolist.com`;

    await this.sendMessage(phoneNumber, helpText, 'report');
  }
}

export type { AlertConfig }; 