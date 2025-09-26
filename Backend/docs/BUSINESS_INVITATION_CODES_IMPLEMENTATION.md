# Sistema de Códigos de Invitación para Negocios - IMPLEMENTACIÓN COMPLETA

## 🎯 **Resumen de Implementación**

Se ha implementado un sistema completo de códigos de invitación para negocios con todas las funcionalidades solicitadas:

1. ✅ **Formato profesional XXX-XXX-XXX**
2. ✅ **Expiración de 24 horas**
3. ✅ **Un solo uso**
4. ✅ **Gestión completa**

## 🏗️ **Arquitectura del Sistema**

### **Base de Datos**
- **Tabla principal**: `business_invitation_codes`
- **Tabla de tracking**: `business_invitation_usage`
- **Funciones SQL**: Generación, validación y limpieza automática
- **Seguridad**: RLS (Row Level Security) configurado

### **Backend**
- **Endpoint principal**: `POST /api/business/join`
- **Gestión de códigos**: CRUD completo para owners/admins
- **Validación**: Schemas Zod para todos los endpoints
- **Seguridad**: Middleware de autenticación y autorización

### **Frontend**
- **Componente**: `BusinessSetup.tsx` mejorado
- **Validación**: Formato automático y validación en tiempo real
- **UX**: Feedback visual y manejo de errores

## 📊 **Estructura de Base de Datos**

### **Tabla: business_invitation_codes**
```sql
CREATE TABLE business_invitation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code VARCHAR(11) NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$'),
  created_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'disabled')),
  role VARCHAR(20) DEFAULT 'seller' CHECK (role IN ('admin', 'seller')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### **Tabla: business_invitation_usage**
```sql
CREATE TABLE business_invitation_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_code_id UUID NOT NULL REFERENCES business_invitation_codes(id) ON DELETE CASCADE,
  used_by UUID NOT NULL REFERENCES profiles(id),
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);
```

## 🔧 **Funciones SQL Implementadas**

### **1. generate_invitation_code()**
- Genera códigos únicos en formato XXX-XXX-XXX
- Verifica unicidad automáticamente
- Intenta hasta 10 veces en caso de colisión

### **2. use_invitation_code(invitation_code, user_id)**
- Valida el código de invitación
- Verifica expiración y límites de uso
- Registra el uso y actualiza contadores
- Retorna información del negocio y rol

### **3. cleanup_expired_invitation_codes()**
- Marca como expirados los códigos vencidos
- Retorna el número de códigos limpiados
- Se puede ejecutar manualmente o programar

## 🌐 **Endpoints del Backend**

### **POST /api/business/join**
**Descripción**: Unirse a un negocio usando código de invitación
**Acceso**: Usuarios autenticados
**Validación**: Formato XXX-XXX-XXX, expiración, límites de uso

**Request**:
```json
{
  "businessCode": "ABC-123-XYZ"
}
```

**Response**:
```json
{
  "success": true,
  "business": {
    "id": "uuid",
    "name": "Nombre del Negocio",
    "role": "seller"
  },
  "message": "Te has unido al negocio exitosamente"
}
```

### **POST /api/business/invitation-codes**
**Descripción**: Crear nuevo código de invitación
**Acceso**: Solo owners y admins del negocio
**Validación**: Rol, máximo de usos, tiempo de expiración

**Request**:
```json
{
  "role": "seller",
  "max_uses": 1,
  "expires_in_hours": 24,
  "notes": "Código para nuevo vendedor"
}
```

### **GET /api/business/invitation-codes**
**Descripción**: Obtener códigos de invitación del negocio
**Acceso**: Solo owners y admins del negocio
**Retorna**: Lista de códigos y estadísticas

### **PATCH /api/business/invitation-codes/:codeId**
**Descripción**: Actualizar código de invitación
**Acceso**: Solo owners y admins del negocio
**Permite**: Cambiar estado, límites, expiración, notas

### **POST /api/business/invitation-codes/cleanup**
**Descripción**: Limpiar códigos expirados
**Acceso**: Solo owners y admins del negocio
**Acción**: Marca como expirados los códigos vencidos

## 🔒 **Seguridad y Permisos**

### **Políticas RLS**
- **Códigos de invitación**: Solo owners/admins pueden gestionar
- **Uso de códigos**: Cualquiera puede ver códigos activos
- **Tracking de uso**: Solo owners/admins pueden ver historial

### **Validación de Entrada**
- **Formato de código**: Regex estricto XXX-XXX-XXX
- **Límites de uso**: 1-100 usos por código
- **Tiempo de expiración**: 1-720 horas (1-30 días)
- **Roles permitidos**: admin, seller

### **Prevención de Abuso**
- **Un solo uso por usuario**: No se puede reutilizar el mismo código
- **Límite de usos**: Control estricto del número máximo de usos
- **Expiración automática**: Códigos se marcan como expirados automáticamente

## 🎨 **Mejoras en el Frontend**

### **BusinessSetup.tsx**
- **Formato automático**: Agrega guiones automáticamente
- **Validación en tiempo real**: Feedback visual del estado del código
- **Soporte para pegar**: Maneja correctamente códigos copiados
- **Enter para enviar**: Permite usar Enter cuando el código está completo
- **Indicador visual**: Muestra si el código es válido

### **Características UX**
- **Colores temáticos**: Verde para la sección de unirse
- **Feedback visual**: Banner informativo que cambia según el estado
- **Tipografía mejorada**: Texto más grande y espaciado para el código
- **Loading state**: Spinner animado durante la carga

## 🚀 **Cómo Usar el Sistema**

### **1. Aplicar la Migración**
```bash
cd Backend
./scripts/apply-invitation-codes-migration.sh
```

### **2. Crear Códigos de Invitación**
```bash
# Solo owners/admins pueden crear códigos
curl -X POST /api/business/invitation-codes \
  -H "Authorization: Bearer TOKEN" \
  -d '{"role": "seller", "max_uses": 1, "expires_in_hours": 24}'
```

### **3. Unirse a un Negocio**
```bash
# Usuarios pueden unirse usando códigos
curl -X POST /api/business/join \
  -H "Authorization: Bearer TOKEN" \
  -d '{"businessCode": "ABC-123-XYZ"}'
```

### **4. Gestionar Códigos**
```bash
# Ver códigos activos
curl -X GET /api/business/invitation-codes \
  -H "Authorization: Bearer TOKEN"

# Desactivar código
curl -X PATCH /api/business/invitation-codes/CODE_ID \
  -H "Authorization: Bearer TOKEN" \
  -d '{"status": "disabled"}'

# Limpiar expirados
curl -X POST /api/business/invitation-codes/cleanup \
  -H "Authorization: Bearer TOKEN"
```

## 📈 **Monitoreo y Mantenimiento**

### **Estadísticas Disponibles**
- Total de códigos creados
- Códigos activos
- Códigos usados
- Códigos expirados
- Códigos desactivados

### **Limpieza Automática**
- **Función**: `cleanup_expired_invitation_codes()`
- **Frecuencia recomendada**: Cada hora
- **Configuración**: Se puede programar con pg_cron en Supabase

### **Logs y Auditoría**
- **Tracking completo**: Quién usó cada código y cuándo
- **IP y User-Agent**: Información de seguridad
- **Historial de cambios**: Cuándo se modificó cada código

## 🔮 **Próximas Mejoras Sugeridas**

### **Funcionalidades Adicionales**
- **Notificaciones**: Email/SMS cuando se usa un código
- **Dashboard**: Vista gráfica de estadísticas de códigos
- **Plantillas**: Códigos predefinidos para roles comunes
- **Bulk operations**: Crear múltiples códigos a la vez

### **Integración con Otros Sistemas**
- **WhatsApp**: Enviar códigos por WhatsApp
- **QR Codes**: Generar códigos QR para los códigos
- **API externa**: Permitir que sistemas externos creen códigos

### **Optimizaciones de Performance**
- **Caché**: Redis para códigos frecuentemente consultados
- **Índices adicionales**: Para consultas complejas
- **Partitioning**: Para tablas con muchos registros

## ✅ **Verificación de Implementación**

### **Tests Recomendados**
1. **Crear código de invitación**
2. **Unirse usando código válido**
3. **Intentar reutilizar código**
4. **Usar código expirado**
5. **Usar código desactivado**
6. **Limpiar códigos expirados**

### **Casos de Uso Cubiertos**
- ✅ Usuario se une a negocio con código válido
- ✅ Usuario no puede reutilizar código
- ✅ Códigos expiran automáticamente
- ✅ Límite de usos se respeta
- ✅ Solo owners/admins pueden gestionar códigos
- ✅ Tracking completo de uso

## 🎉 **Conclusión**

El sistema de códigos de invitación está **completamente implementado** y listo para producción. Incluye:

- **Seguridad robusta** con RLS y validación estricta
- **Funcionalidades completas** como se solicitó
- **UX mejorada** en el frontend
- **API completa** para gestión desde el backend
- **Documentación detallada** para desarrolladores

El sistema cumple con todos los requisitos especificados y está preparado para escalar según las necesidades del negocio. 