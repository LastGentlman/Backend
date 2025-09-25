# 📧 Integración de Resend con Backend

## 🎯 Descripción

Esta integración utiliza Resend directamente desde el backend para enviar emails de notificación, aprovechando la misma configuración de Resend que ya tienes en Supabase.

## 🏗️ Arquitectura

```
Backend API → Resend → Email
```

## 📋 Configuración Requerida

### 1. Variables de Entorno

Agrega estas variables a tu archivo `.env` del backend:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@tudominio.com
RESEND_FROM_NAME=PedidoList
```

**Nota:** Usa la misma API key de Resend que ya tienes configurada en Supabase.

### 2. Obtener tu API Key de Resend

1. Ve a [https://resend.com/dashboard](https://resend.com/dashboard)
2. Haz clic en **API Keys** en el sidebar
3. Copia tu API key (empieza con `re_`)

## 📧 Tipos de Emails Implementados

### 1. Notificación de Eliminación de Cuenta
- **Destinatario**: Owner del negocio
- **Contenido**: Detalles de la cuenta eliminada, período de gracia
- **Trigger**: Cuando un empleado elimina su cuenta

### 2. Notificación de Desvinculación
- **Destinatario**: Owner del negocio
- **Contenido**: Empleado que se desvinculó del negocio
- **Trigger**: Cuando un empleado se desvincula

### 3. Recordatorio de Período de Gracia
- **Destinatario**: Usuario que eliminó su cuenta
- **Contenido**: Aviso de que la cuenta se eliminará permanentemente
- **Trigger**: Antes del fin del período de gracia (90 días)

### 4. Confirmación de Recuperación
- **Destinatario**: Usuario que recuperó su cuenta
- **Contenido**: Confirmación de que la cuenta está activa
- **Trigger**: Cuando un usuario recupera su cuenta

## 🔧 Uso en el Código

### Envío Automático

Los emails se envían automáticamente desde los endpoints:

```typescript
// En auth.ts - Eliminación de cuenta
await emailNotificationService.notifyOwnerOfAccountDeletion({
  userEmail: 'owner@business.com',
  userName: user.email,
  businessName: 'Mi Negocio',
  userRole: 'seller',
  deletionDate: new Date().toISOString(),
  totalOrders: 25,
  accountAge: 180
});

// En business.ts - Desvinculación de empleado
await emailNotificationService.notifyOwnerOfEmployeeDisassociation({
  userEmail: 'employee@business.com',
  userName: 'Juan Pérez',
  businessName: 'Mi Negocio',
  userRole: 'seller',
  deletionDate: new Date().toISOString()
});
```

### Envío Manual

```typescript
import { emailNotificationService } from '../services/EmailNotificationService.ts';

// Enviar recordatorio de período de gracia
await emailNotificationService.sendGracePeriodReminder({
  userEmail: 'user@example.com',
  userName: 'Usuario',
  businessName: 'Mi Negocio',
  daysRemaining: 7,
  gracePeriodEnd: '2024-03-15T00:00:00Z'
});

// Enviar confirmación de recuperación
await emailNotificationService.sendAccountRecoveryConfirmation({
  userEmail: 'user@example.com',
  userName: 'Usuario',
  businessName: 'Mi Negocio'
});
```

## 🎨 Templates de Email

Los templates están definidos en `EmailNotificationService.ts` y incluyen:

- **HTML**: Diseño responsivo con colores de marca
- **Text**: Versión de texto plano para compatibilidad
- **Variables dinámicas**: Datos personalizados por usuario

### Ejemplo de Template

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #dc2626;">Cuenta Eliminada</h2>
  <p>Se ha eliminado una cuenta en tu negocio <strong>${businessName}</strong>.</p>
  <!-- Más contenido... -->
</div>
```

## 🚀 Configuración

### 1. Verificar Configuración

```bash
# Verificar que las variables están configuradas
./scripts/test-email-integration.sh
```

### 2. Probar la Integración

```bash
# Test manual
curl -X POST http://localhost:8000/api/auth/account \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"confirmation": "ELIMINAR MI CUENTA"}'
```

## 🔍 Monitoreo

### Logs del Backend

```bash
# Ver logs en tiempo real
tail -f logs/app.log

# Buscar emails enviados
grep "Email sent successfully" logs/app.log
```

### Métricas de Resend

- Dashboard de Resend: https://resend.com/dashboard
- Métricas de entrega, apertura, clics
- Análisis de spam score

## 🛠️ Troubleshooting

### Error: "RESEND_API_KEY not found"
- Verificar que la variable está en el archivo `.env`
- Reiniciar el servidor después de agregar la variable

### Error: "Resend error"
- Verificar que la API key es válida
- Revisar logs de Resend para detalles
- Verificar dominio verificado en Resend

### Error: "Email logged instead of sent"
- La API key no está configurada
- El email se logra en lugar de enviarse

## 📈 Ventajas de esta Integración

1. **Simplicidad**: No requiere Supabase Edge Functions
2. **Misma configuración**: Usa tu API key existente de Resend
3. **Control total**: Envío directo desde el backend
4. **Fácil debugging**: Logs directos en el backend
5. **Sin dependencias adicionales**: Solo Resend

## 🔗 Enlaces Útiles

- [Documentación de Resend](https://resend.com/docs)
- [Resend Dashboard](https://resend.com/dashboard)
- [Supabase Auth Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates) 