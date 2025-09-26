# Sistema de Backup Automático en AWS S3

## 📋 Descripción

Sistema completo de backup automático que permite a los usuarios crear, gestionar y restaurar copias de seguridad de sus datos en AWS S3.

## 🏗️ Arquitectura

### Backend
- **BackupService**: Servicio principal para operaciones de backup
- **Rutas API**: Endpoints REST para gestión de backups
- **Base de datos**: Tabla `backup_metadata` para tracking
- **AWS S3**: Almacenamiento de archivos de backup

### Frontend
- **BackupService**: Cliente para comunicación con API
- **useBackup Hook**: Hook de React Query para gestión de estado
- **UI Components**: Interfaz en página de perfil

## 🔧 Configuración

### Variables de Entorno Requeridas

```bash
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
S3_BUCKET=pedidolist-backups

# Backup Configuration (Opcionales)
BACKUP_RETENTION_DAYS=30
BACKUP_COMPRESSION=true
```

### Estructura del Bucket S3

```
s3://pedidolist-backups/
├── backups/
│   ├── {user_id}/
│   │   ├── backup-{user_id}-{timestamp}.json
│   │   └── incremental/
│   │       └── incremental-{user_id}-{timestamp}.json
│   └── ...
```

## 📊 Tipos de Backup

### 1. Backup Completo
- **Descripción**: Incluye todos los datos del usuario
- **Uso**: Backup inicial o restauración completa
- **Frecuencia**: Manual o programado

### 2. Backup Incremental
- **Descripción**: Solo datos modificados desde el último backup
- **Uso**: Backups regulares para eficiencia
- **Frecuencia**: Automático o manual

### 3. Backup Manual
- **Descripción**: Backup iniciado por el usuario
- **Uso**: Antes de cambios importantes
- **Frecuencia**: Bajo demanda

## 🗄️ Datos Incluidos

El sistema respalda las siguientes tablas:
- `profiles` - Perfiles de usuario
- `businesses` - Información de negocios
- `products` - Catálogo de productos
- `clients` - Base de clientes
- `orders` - Pedidos y transacciones
- `order_items` - Detalles de pedidos
- `notifications` - Notificaciones
- `user_settings` - Configuraciones

## 🔒 Seguridad

### Row Level Security (RLS)
- Los usuarios solo pueden acceder a sus propios backups
- Políticas RLS implementadas en `backup_metadata`

### Integridad de Datos
- Checksums SHA-256 para verificación
- Validación de integridad en restauración
- Compresión opcional para eficiencia

### Autenticación
- Requiere autenticación de usuario
- Protección CSRF en todas las operaciones
- Solo propietarios pueden limpiar backups antiguos

## 📡 API Endpoints

### POST /api/backup/create
Crea un nuevo backup
```json
{
  "type": "full" | "incremental"
}
```

### GET /api/backup/list
Lista todos los backups del usuario

### POST /api/backup/restore
Restaura desde un backup
```json
{
  "backupId": "backup-user-123-456789"
}
```

### GET /api/backup/status
Obtiene estadísticas de backup

### DELETE /api/backup/cleanup
Limpia backups antiguos (solo propietarios)

## 🎯 Funcionalidades

### Creación de Backup
- ✅ Backup completo e incremental
- ✅ Compresión opcional
- ✅ Verificación de integridad
- ✅ Metadatos detallados

### Gestión de Backups
- ✅ Lista de backups disponibles
- ✅ Estado de cada backup
- ✅ Estadísticas de uso
- ✅ Limpieza automática

### Restauración
- ✅ Restauración selectiva
- ✅ Verificación de integridad
- ✅ Manejo de errores
- ✅ Logs detallados

## 🚀 Uso

### Desde la Interfaz
1. Ir a **Perfil** → **Configuración** → **Backup de datos**
2. Ver estado actual de backups
3. Crear nuevo backup (completo o incremental)
4. Restaurar desde backup existente
5. Limpiar backups antiguos (solo propietarios)

### Desde la API
```typescript
// Crear backup completo
const result = await BackupService.createBackup({ type: 'full' })

// Listar backups
const backups = await BackupService.listBackups()

// Restaurar backup
await BackupService.restoreBackup({ backupId: 'backup-123' })
```

## 🔄 Automatización

### Backup Programado
El sistema está preparado para integración con:
- **Cron jobs** para backups automáticos
- **Webhooks** para triggers externos
- **Eventos de base de datos** para backups incrementales

### Retención
- **Política de retención**: 30 días por defecto
- **Limpieza automática**: Función `cleanup_old_backups()`
- **Configuración flexible**: Variable `BACKUP_RETENTION_DAYS`

## 📈 Monitoreo

### Métricas Disponibles
- Total de backups por usuario
- Tamaño total de almacenamiento
- Tasa de éxito/fallo
- Último backup realizado

### Logs
- Operaciones de backup/restauración
- Errores y excepciones
- Métricas de rendimiento
- Actividad de limpieza

## 🛠️ Mantenimiento

### Limpieza Manual
```sql
-- Limpiar backups de más de 30 días
SELECT cleanup_old_backups(30);
```

### Verificación de Integridad
```sql
-- Verificar estadísticas de backup
SELECT * FROM backup_statistics WHERE user_id = 'user-123';
```

### Monitoreo de Espacio
```sql
-- Verificar uso de espacio por usuario
SELECT 
    user_id,
    COUNT(*) as total_backups,
    SUM(size) as total_size_bytes
FROM backup_metadata 
WHERE status = 'completed'
GROUP BY user_id;
```

## 🚨 Troubleshooting

### Problemas Comunes

#### Error de Autenticación AWS
```
Error: The security token included in the request is invalid
```
**Solución**: Verificar credenciales AWS y permisos S3

#### Backup Fallido
```
Error: No authenticated user
```
**Solución**: Verificar sesión de usuario y permisos RLS

#### Restauración Fallida
```
Error: Backup checksum verification failed
```
**Solución**: El archivo de backup está corrupto, usar otro backup

### Logs de Debug
```bash
# Ver logs del backend
tail -f Backend/logs/backup.log

# Ver logs de Supabase
supabase logs --follow
```

## 📚 Referencias

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [React Query Documentation](https://tanstack.com/query/latest)
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/)

## 🔮 Roadmap

### Próximas Funcionalidades
- [ ] Backup programado automático
- [ ] Compresión avanzada (gzip)
- [ ] Backup diferencial
- [ ] Restauración selectiva por tabla
- [ ] Notificaciones de backup
- [ ] Dashboard de métricas
- [ ] Backup cross-region
- [ ] Encriptación de backups

### Mejoras Técnicas
- [ ] Streaming para backups grandes
- [ ] Paralelización de operaciones
- [ ] Cache de metadatos
- [ ] Optimización de queries
- [ ] Monitoreo en tiempo real
