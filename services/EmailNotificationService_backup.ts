/**
 * Email Notification Service
 * Handles all email notifications for account management
 */

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

interface NotificationData {
  userEmail: string;
  userName?: string;
  businessName?: string;
  userRole?: string;
  deletionDate?: string;
  gracePeriodEnd?: string;
  daysRemaining?: number;
  totalOrders?: number;
  accountAge?: number;
}

export class EmailNotificationService {
  private static instance: EmailNotificationService;
  private isEnabled: boolean;

  private constructor() {
    // Check if email service is configured
    this.isEnabled = !!Deno.env.get('EMAIL_SERVICE_ENABLED') || false;
  }

  public static getInstance(): EmailNotificationService {
    if (!EmailNotificationService.instance) {
      EmailNotificationService.instance = new EmailNotificationService();
    }
    return EmailNotificationService.instance;
  }

  /**
   * Send account deletion notification to business owner
   */
  async notifyOwnerOfAccountDeletion(data: NotificationData): Promise<boolean> {
    if (!this.isEnabled) {
      console.log('📧 Email notification skipped (service disabled): Account deletion notification');
      return true;
    }

    try {
      const template = this.getAccountDeletionTemplate(data);
      await this.sendEmail(data.userEmail, template);
      
      console.log(`📧 Account deletion notification sent to: ${data.userEmail}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending account deletion notification:', error);
      return false;
    }
  }

  /**
   * Send employee disassociation notification to business owner
   */
  async notifyOwnerOfEmployeeDisassociation(data: NotificationData): Promise<boolean> {
    if (!this.isEnabled) {
      console.log('📧 Email notification skipped (service disabled): Employee disassociation notification');
      return true;
    }

    try {
      const template = this.getEmployeeDisassociationTemplate(data);
      await this.sendEmail(data.userEmail, template);
      
      console.log(`📧 Employee disassociation notification sent to: ${data.userEmail}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending employee disassociation notification:', error);
      return false;
    }
  }

  /**
   * Send grace period reminder to user
   */
  async sendGracePeriodReminder(data: NotificationData): Promise<boolean> {
    if (!this.isEnabled) {
      console.log('📧 Email notification skipped (service disabled): Grace period reminder');
      return true;
    }

    try {
      const template = this.getGracePeriodReminderTemplate(data);
      await this.sendEmail(data.userEmail, template);
      
      console.log(`📧 Grace period reminder sent to: ${data.userEmail}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending grace period reminder:', error);
      return false;
    }
  }

  /**
   * Send account recovery confirmation
   */
  async sendAccountRecoveryConfirmation(data: NotificationData): Promise<boolean> {
    if (!this.isEnabled) {
      console.log('📧 Email notification skipped (service disabled): Account recovery confirmation');
      return true;
    }

    try {
      const template = this.getAccountRecoveryTemplate(data);
      await this.sendEmail(data.userEmail, template);
      
      console.log(`📧 Account recovery confirmation sent to: ${data.userEmail}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending account recovery confirmation:', error);
      return false;
    }
  }

  /**
   * Get account deletion email template
   */
  private getAccountDeletionTemplate(data: NotificationData): EmailTemplate {
    const subject = `🗑️ Cuenta eliminada - ${data.businessName || 'PedidoList'}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Cuenta Eliminada</h2>
        <p>Hola,</p>
        <p>Se ha eliminado una cuenta en tu negocio <strong>${data.businessName || 'PedidoList'}</strong>.</p>
        
        <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #dc2626; margin-top: 0;">Detalles de la eliminación:</h3>
          <ul style="margin: 10px 0;">
            <li><strong>Usuario:</strong> ${data.userEmail}</li>
            <li><strong>Rol:</strong> ${data.userRole || 'N/A'}</li>
            <li><strong>Fecha de eliminación:</strong> ${data.deletionDate || 'N/A'}</li>
            <li><strong>Pedidos totales:</strong> ${data.totalOrders || 0}</li>
            <li><strong>Tiempo en la empresa:</strong> ${data.accountAge || 0} días</li>
          </ul>
        </div>
        
        <p><strong>Período de gracia:</strong> El usuario tiene 90 días para recuperar su cuenta si cambia de opinión.</p>
        
        <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
        
        <p>Saludos,<br>Equipo de PedidoList</p>
      </div>
    `;

    const text = `
      Cuenta Eliminada
      
      Se ha eliminado una cuenta en tu negocio ${data.businessName || 'PedidoList'}.
      
      Detalles:
      - Usuario: ${data.userEmail}
      - Rol: ${data.userRole || 'N/A'}
      - Fecha: ${data.deletionDate || 'N/A'}
      - Pedidos: ${data.totalOrders || 0}
      - Tiempo: ${data.accountAge || 0} días
      
      Período de gracia: 90 días para recuperar.
      
      Saludos,
      Equipo de PedidoList
    `;

    return { subject, html, text };
  }

  /**
   * Get employee disassociation email template
   */
  private getEmployeeDisassociationTemplate(data: NotificationData): EmailTemplate {
    const subject = `👤 Empleado desvinculado - ${data.businessName || 'PedidoList'}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">Empleado Desvinculado</h2>
        <p>Hola,</p>
        <p>Un empleado se ha desvinculado de tu negocio <strong>${data.businessName || 'PedidoList'}</strong>.</p>
        
        <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #f59e0b; margin-top: 0;">Detalles de la desvinculación:</h3>
          <ul style="margin: 10px 0;">
            <li><strong>Empleado:</strong> ${data.userEmail}</li>
            <li><strong>Rol:</strong> ${data.userRole || 'N/A'}</li>
            <li><strong>Fecha de desvinculación:</strong> ${data.deletionDate || 'N/A'}</li>
          </ul>
        </div>
        
        <p>El empleado mantiene su cuenta y puede unirse a otro negocio o crear el suyo propio.</p>
        
        <p>Saludos,<br>Equipo de PedidoList</p>
      </div>
    `;

    const text = `
      Empleado Desvinculado
      
      Un empleado se ha desvinculado de tu negocio ${data.businessName || 'PedidoList'}.
      
      Detalles:
      - Empleado: ${data.userEmail}
      - Rol: ${data.userRole || 'N/A'}
      - Fecha: ${data.deletionDate || 'N/A'}
      
      El empleado mantiene su cuenta.
      
      Saludos,
      Equipo de PedidoList
    `;

    return { subject, html, text };
  }

  /**
   * Get grace period reminder email template
   */
  private getGracePeriodReminderTemplate(data: NotificationData): EmailTemplate {
    const subject = `⏰ Tu cuenta se eliminará pronto - ${data.daysRemaining} días restantes`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Tu cuenta se eliminará pronto</h2>
        <p>Hola ${data.userName || 'usuario'},</p>
        <p>Tu cuenta en <strong>${data.businessName || 'PedidoList'}</strong> será eliminada permanentemente en <strong>${data.daysRemaining} días</strong>.</p>
        
        <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #dc2626; margin-top: 0;">¿Quieres recuperar tu cuenta?</h3>
          <p>Si cambiaste de opinión, puedes recuperar tu cuenta antes del ${data.gracePeriodEnd}.</p>
          <p style="margin: 20px 0;">
            <a href="${Deno.env.get('FRONTEND_URL') || 'https://app.pedidolist.com'}/recover-account" 
               style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Recuperar mi cuenta
            </a>
          </p>
        </div>
        
        <p><strong>Después de este período, tu cuenta y todos tus datos se eliminarán permanentemente.</strong></p>
        
        <p>Saludos,<br>Equipo de PedidoList</p>
      </div>
    `;

    const text = `
      Tu cuenta se eliminará pronto
      
      Hola ${data.userName || 'usuario'},
      
      Tu cuenta en ${data.businessName || 'PedidoList'} será eliminada permanentemente en ${data.daysRemaining} días.
      
      ¿Quieres recuperar tu cuenta?
      Si cambiaste de opinión, puedes recuperar tu cuenta antes del ${data.gracePeriodEnd}.
      
      Enlace para recuperar: ${Deno.env.get('FRONTEND_URL') || 'https://app.pedidolist.com'}/recover-account
      
      Después de este período, tu cuenta y todos tus datos se eliminarán permanentemente.
      
      Saludos,
      Equipo de PedidoList
    `;

    return { subject, html, text };
  }

  /**
   * Get account recovery confirmation email template
   */
  private getAccountRecoveryTemplate(data: NotificationData): EmailTemplate {
    const subject = `✅ Cuenta recuperada exitosamente - ${data.businessName || 'PedidoList'}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #059669;">¡Cuenta Recuperada!</h2>
        <p>Hola ${data.userName || 'usuario'},</p>
        <p>Tu cuenta en <strong>${data.businessName || 'PedidoList'}</strong> ha sido recuperada exitosamente.</p>
        
        <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #059669; margin-top: 0;">Tu cuenta está activa nuevamente</h3>
          <p>Puedes acceder a tu cuenta normalmente con tu email y contraseña.</p>
          <p style="margin: 20px 0;">
            <a href="${Deno.env.get('FRONTEND_URL') || 'https://app.pedidolist.com'}/login" 
               style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Iniciar sesión
            </a>
          </p>
        </div>
        
        <p>¡Bienvenido de vuelta!</p>
        
        <p>Saludos,<br>Equipo de PedidoList</p>
      </div>
    `;

    const text = `
      ¡Cuenta Recuperada!
      
      Hola ${data.userName || 'usuario'},
      
      Tu cuenta en ${data.businessName || 'PedidoList'} ha sido recuperada exitosamente.
      
      Tu cuenta está activa nuevamente
      Puedes acceder a tu cuenta normalmente con tu email y contraseña.
      
      Enlace para iniciar sesión: ${Deno.env.get('FRONTEND_URL') || 'https://app.pedidolist.com'}/login
      
      ¡Bienvenido de vuelta!
      
      Saludos,
      Equipo de PedidoList
    `;

    return { subject, html, text };
  }

  /**
   * Send email via Resend (using the same API key configured in Supabase)
   */
  private async sendEmail(to: string, template: EmailTemplate): Promise<void> {
    try {
      // Get Resend API key from environment (same one used in Supabase)
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      
      if (!resendApiKey) {
        console.warn('⚠️  RESEND_API_KEY not found in environment. Logging email instead.');
        console.log(`📧 Email would be sent to ${to}:`);
        console.log(`   Subject: ${template.subject}`);
        console.log(`   HTML: ${template.html.substring(0, 100)}...`);
        return;
      }

      // Import Resend dynamically
      const { Resend } = await import('npm:resend');
      const resend = new Resend(resendApiKey);

      // Get sender email from environment or use default
      const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@pedidolist.com';
      const fromName = Deno.env.get('RESEND_FROM_NAME') || 'PedidoList';

      // Send email via Resend
      const { data, error } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject: template.subject,
        html: template.html,
        text: template.text
      });

      if (error) {
        throw new Error(`Resend error: ${error.message}`);
      }

      console.log(`📧 Email sent successfully to ${to} via Resend (ID: ${data?.id})`);
    } catch (error) {
      console.error('Error sending email via Resend:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const emailNotificationService = EmailNotificationService.getInstance(); 