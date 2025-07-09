# WhatsApp Business Integration - PedidoList

## 📱 Descripción General

Esta integración permite a los negocios usar WhatsApp Business API para:

- Enviar notificaciones automáticas a clientes
- Recibir y procesar mensajes de clientes
- Configurar alertas inteligentes basadas en eventos del negocio
- Gestionar reglas de alerta personalizables
- Obtener analytics y reportes de comunicación

## 🚀 Características Principales

### ✅ Funcionalidades Implementadas

1. **Envío de Mensajes**
   - Mensajes de texto personalizados
   - Templates predefinidos para casos comunes
   - Soporte para variables dinámicas
   - Logging completo de mensajes

2. **Alertas de Negocio**
   - Nuevos pedidos
   - Pedidos retrasados
   - Confirmaciones de pedido
   - Notificaciones de pedido listo
   - Recordatorios de pago

3. **Reglas de Alertas Inteligentes**
   - Configuración por negocio
   - Condiciones personalizables
   - Acciones múltiples (WhatsApp, Push, Email)
   - Programación de alertas diferidas

4. **Analytics y Reportes**
   - Estadísticas de mensajes enviados/recibidos
   - Tasa de éxito de envío
   - Tiempo promedio de respuesta
   - Logs detallados por negocio

5. **Configuración Flexible**
   - Horarios de negocio
   - Escalación de alertas
   - Números de teléfono por prioridad
   - Respuestas automáticas

## 🛠️ Configuración Inicial

### 1. Variables de Entorno

Agregar al archivo `.env`:

```bash
# WhatsApp Business API
META_WHATSAPP_TOKEN=tu_token_de_acceso_aqui
META_PHONE_NUMBER_ID=tu_phone_number_id_aqui
META_APP_SECRET=tu_app_secret_aqui

# Webhook Configuration
WEBHOOK_VERIFY_TOKEN=token_secreto_para_webhook
WHATSAPP_WEBHOOK_URL=https://tu-dominio.com/api/whatsapp/webhook

# Configuración de Horarios
BUSINESS_HOURS_START=09:00
BUSINESS_HOURS_END=22:00
TIMEZONE=America/Mexico_City
```

### 2. Base de Datos

Ejecutar el archivo de migración:

```sql
-- Ejecutar en Supabase SQL Editor
-- Ver archivo: migrations/whatsapp_integration.sql
```

### 3. Configurar Webhook en Meta

1. Ir a [Meta for Developers](https://developers.facebook.com/)
2. Seleccionar tu app
3. Configurar webhook URL: `https://tu-dominio.com/api/whatsapp/webhook`
4. Verificar token: usar el valor de `WEBHOOK_VERIFY_TOKEN`

## 📋 Endpoints Disponibles

### Webhook (Meta)

```bash
GET  /api/whatsapp/webhook    - Verificación del webhook
POST /api/whatsapp/webhook    - Recibir mensajes de WhatsApp
```

### Mensajes

```bash
POST /api/whatsapp/send-message              - Enviar mensaje general
POST /api/whatsapp/send-order-confirmation   - Confirmar pedido
POST /api/whatsapp/send-order-ready          - Notificar pedido listo
```

### Alertas de Negocio

```bash
POST /api/whatsapp/trigger-new-order-alert   - Disparar alerta de nuevo pedido
POST /api/whatsapp/check-delayed-orders      - Verificar pedidos retrasados
```

### Reglas de Alerta

```bash
GET    /api/whatsapp/alert-rules/:businessId     - Obtener reglas
POST   /api/whatsapp/alert-rules                 - Crear regla
PUT    /api/whatsapp/alert-rules/:ruleId         - Actualizar regla
DELETE /api/whatsapp/alert-rules/:ruleId         - Eliminar regla
```

### Analytics

```bash
GET /api/whatsapp/analytics/:businessId      - Estadísticas de WhatsApp
GET /api/whatsapp/logs/:businessId           - Logs de mensajes
GET /api/whatsapp/templates                  - Templates disponibles
```

### Testing

```bash
POST /api/whatsapp/send-test-alert           - Enviar alerta de prueba
POST /api/whatsapp/configure-alerts          - Configurar alertas
```

## 💡 Ejemplos de Uso

### 1. Enviar Confirmación de Pedido

```typescript
// Cuando se confirma un pedido
const response = await fetch('/api/whatsapp/send-order-confirmation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ orderId: 'order-123' })
});

const result = await response.json();
// result.success = true/false
```

### 2. Crear Regla de Alerta

```typescript
const newRule = {
  business_id: 'business-123',
  event_type: 'new_order',
  conditions: { amount_threshold: 1000 },
  actions: [{
    type: 'whatsapp',
    recipients: ['+525512345678'],
    template: '🆕 Nuevo pedido de ${{order.total}} recibido!'
  }],
  is_active: true
};

const response = await fetch('/api/whatsapp/alert-rules', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(newRule)
});
```

### 3. Obtener Analytics

```typescript
const response = await fetch('/api/whatsapp/analytics/business-123?period=week');
const analytics = await response.json();

console.log(analytics);
// {
//   success: true,
//   analytics: {
//     messagesSent: 45,
//     messagesReceived: 12,
//     successRate: 95.6,
//     responseRate: 375,
//     avgResponseTime: 0,
//     topRecipients: []
//   }
// }
```

## 🎨 Templates Disponibles

### Variables Disponibles

- `{{order.folio}}` - Número de pedido
- `{{order.client_name}}` - Nombre del cliente
- `{{order.total}}` - Total del pedido
- `{{order.delivery_date}}` - Fecha de entrega
- `{{business.name}}` - Nombre del negocio
- `{{business.address}}` - Dirección del negocio
- `{{alert.message}}` - Mensaje de alerta
- `{{alert.metric}}` - Métrica del sistema
- `{{alert.value}}` - Valor actual
- `{{alert.threshold}}` - Límite configurado

### Templates Predefinidos

```typescript
import { WhatsAppTemplates } from '../services/WhatsAppAlertsService';

// Nuevo pedido
WhatsAppTemplates.newOrder

// Confirmación de pedido
WhatsAppTemplates.orderConfirmation

// Pedido listo
WhatsAppTemplates.orderReady

// Retraso de pedido
WhatsAppTemplates.orderDelay

// Recordatorio de pago
WhatsAppTemplates.paymentReminder

// Alerta del sistema
WhatsAppTemplates.systemAlert
```

## 🔧 Configuración Avanzada

### Configuración por Negocio

```typescript
import { AlertRulesService } from '../services/AlertRulesService';

// Crear configuración para un negocio
const config = {
  business_id: 'business-123',
  phone_numbers: ['+525512345678', '+525512345679'],
  business_hours: {
    start: '09:00',
    end: '18:00',
    timezone: 'America/Mexico_City'
  },
  escalation: {
    immediate: ['+525512345678'],  // CTO/Fundador
    delayed: ['+525512345679'],    // DevOps team
    weekend: ['+525512345678']     // Solo críticos
  },
  auto_responses: {
    enabled: true,
    templates: {
      greeting: '¡Hola! Gracias por contactarnos.',
      status: 'Para consultar el estado de tu pedido, compártenos tu número de pedido.'
    }
  }
};

await AlertRulesService.upsertBusinessConfig(config);
```

### Reglas de Alerta Personalizadas

```typescript
// Regla para pedidos de alto valor
const highValueRule = {
  business_id: 'business-123',
  event_type: 'new_order',
  conditions: { amount_threshold: 5000 },
  actions: [{
    type: 'whatsapp',
    recipients: ['+525512345678'],
    template: '🚨 PEDIDO DE ALTO VALOR: ${{order.total}}',
    delay: 0
  }],
  is_active: true
};

// Regla para pedidos retrasados
const delayedRule = {
  business_id: 'business-123',
  event_type: 'order_delayed',
  conditions: { delay_hours: 3 },
  actions: [{
    type: 'whatsapp',
    recipients: ['+525512345679'],
    template: '⏰ Pedido #{{order.folio}} lleva 3+ horas sin atender',
    delay: 180 // 3 horas
  }],
  is_active: true
};
```

## 📊 Monitoreo y Analytics

### Métricas Disponibles

- **Mensajes Enviados**: Total de mensajes outbound
- **Mensajes Recibidos**: Total de mensajes inbound
- **Tasa de Éxito**: Porcentaje de mensajes enviados exitosamente
- **Tasa de Respuesta**: Ratio de mensajes enviados vs recibidos
- **Tiempo Promedio de Respuesta**: Tiempo entre mensaje recibido y respuesta

### Logs Detallados

Cada mensaje se registra con:

- Número de teléfono
- Tipo de mensaje (inbound/outbound)
- Contenido
- Estado (sent/failed/delivered/read)
- Prioridad
- Contexto adicional
- Timestamp

## 🔒 Seguridad

### Verificación de Webhook

- Firma HMAC-SHA256 para verificar autenticidad
- Token de verificación configurable
- Validación de origen de Meta

### Control de Acceso

- Row Level Security (RLS) en Supabase
- Políticas por negocio
- Validación de permisos de usuario

### Rate Limiting

- Límites configurables por endpoint
- Protección contra spam
- Monitoreo de uso

## 🚨 Troubleshooting

### Problemas Comunes

1. **Mensajes no se envían**
   - Verificar `META_WHATSAPP_TOKEN`
   - Verificar `META_PHONE_NUMBER_ID`
   - Revisar logs de error

2. **Webhook no funciona**
   - Verificar `WEBHOOK_VERIFY_TOKEN`
   - Verificar URL del webhook
   - Revisar configuración en Meta

3. **Alertas no se disparan**
   - Verificar reglas activas
   - Verificar números de teléfono
   - Revisar condiciones de reglas

### Logs Útiles

```bash
# Ver logs de WhatsApp
tail -f logs/whatsapp.log

# Ver errores de webhook
grep "webhook" logs/error.log

# Ver alertas disparadas
grep "ALERTA" logs/app.log
```

## 🔄 Integración con Frontend

### Hook para React

```typescript
// hooks/useWhatsApp.ts
import { useState, useEffect } from 'react';

export function useWhatsApp(businessId: string) {
  const [analytics, setAnalytics] = useState(null);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWhatsAppData();
  }, [businessId]);

  const loadWhatsAppData = async () => {
    try {
      const [analyticsRes, rulesRes] = await Promise.all([
        fetch(`/api/whatsapp/analytics/${businessId}`),
        fetch(`/api/whatsapp/alert-rules/${businessId}`)
      ]);

      const analyticsData = await analyticsRes.json();
      const rulesData = await rulesRes.json();

      setAnalytics(analyticsData.analytics);
      setRules(rulesData.rules);
    } catch (error) {
      console.error('Error loading WhatsApp data:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (to: string, message: string) => {
    const response = await fetch('/api/whatsapp/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, message, businessId })
    });
    return response.json();
  };

  return {
    analytics,
    rules,
    loading,
    sendMessage,
    refresh: loadWhatsAppData
  };
}
```

## 📈 Roadmap

### Próximas Funcionalidades

- [ ] Soporte para mensajes multimedia (imágenes, documentos)
- [ ] Chatbot inteligente con IA
- [ ] Integración con CRM
- [ ] Reportes automáticos por email
- [ ] Dashboard de analytics en tiempo real
- [ ] Integración con otros canales (SMS, Email)
- [ ] Plantillas de mensaje visuales
- [ ] Autenticación de clientes por WhatsApp

### Mejoras Técnicas

- [ ] Cache de templates
- [ ] Queue de mensajes para alta concurrencia
- [ ] Compresión de logs
- [ ] Backup automático de configuraciones
- [ ] API GraphQL para consultas complejas

## 📞 Soporte

Para soporte técnico:

- Email: <tech@pedidolist.com>
- Documentación: [docs.pedidolist.com](https://docs.pedidolist.com)
- GitHub Issues: [github.com/pedidolist/issues](https://github.com/pedidolist/issues)

---

**Versión**: 1.0.0  
**Última actualización**: Diciembre 2024  
**Compatibilidad**: Deno 1.x, Supabase, React 18+
