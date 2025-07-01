# Sistema de Resolución de Conflictos Last-Write-Wins

## Descripción General

El sistema de resolución de conflictos implementa la estrategia **Last-Write-Wins** para manejar conflictos de sincronización entre datos locales (offline) y del servidor (online) en la aplicación PedidoList.

## Características Principales

### 🔄 Resolución Automática
- **Last-Write-Wins**: El cambio más reciente siempre gana
- **Detección automática**: Identifica conflictos por campo específico
- **Auditoría completa**: Registra todas las resoluciones para análisis

### 📊 Campos Monitoreados
- `client_name` - Nombre del cliente
- `client_phone` - Teléfono del cliente  
- `total` - Total de la orden
- `delivery_date` - Fecha de entrega
- `delivery_time` - Hora de entrega
- `status` - Estado de la orden
- `notes` - Notas adicionales

## Arquitectura

### Componentes Principales

1. **ConflictResolver** (`utils/conflictResolution.ts`)
   - Clase principal para resolver conflictos
   - Métodos estáticos para diferentes operaciones

2. **Tabla de Auditoría** (`supabase/migrations/conflict_resolutions.sql`)
   - Registra todas las resoluciones
   - Incluye estadísticas y análisis

3. **Rutas API** (`routes/orders.ts`)
   - Endpoints para sincronización con conflictos
   - Historial y estadísticas

## Uso del Sistema

### Sincronización con Resolución de Conflictos

```typescript
// Sincronizar órdenes offline con resolución automática
const result = await syncAllPendingOrders(offlineOrders, userId);

// Resultado incluye:
// - synced: órdenes sincronizadas exitosamente
// - errors: errores durante la sincronización
// - conflicts: conflictos resueltos
```

### Resolución Manual de Conflictos

```typescript
// Resolver un conflicto específico
const resolution = await ConflictResolver.resolveOrderConflict(
  localOrder, 
  serverOrder
);

// Aplicar la resolución
await ConflictResolver.applyResolution(
  orderId, 
  resolution, 
  userId
);
```

## Endpoints API

### POST `/api/orders/sync`
Sincroniza órdenes offline con resolución automática de conflictos.

**Request:**
```json
{
  "orders": [
    {
      "client_generated_id": "uuid",
      "client_name": "Juan Pérez",
      "total": 150.00,
      "last_modified_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Response:**
```json
{
  "synced": [...],
  "errors": [...],
  "conflicts": [...],
  "message": "Sincronización completada. 5 órdenes sincronizadas, 0 errores."
}
```

### POST `/api/orders/resolve-conflict/:orderId`
Resuelve un conflicto específico manualmente.

**Request:**
```json
{
  "localOrder": { ... },
  "serverOrder": { ... }
}
```

### GET `/api/orders/conflict-history`
Obtiene el historial de resoluciones de conflictos.

### GET `/api/orders/conflict-stats`
Obtiene estadísticas de conflictos para el negocio.

## Estrategia Last-Write-Wins

### Algoritmo de Resolución

1. **Comparación de Timestamps**
   ```typescript
   const localTimestamp = new Date(localOrder.last_modified_at);
   const serverTimestamp = new Date(serverOrder.last_modified_at);
   ```

2. **Decisión**
   - Si `localTimestamp > serverTimestamp` → **Local Wins**
   - Si `serverTimestamp > localTimestamp` → **Server Wins**
   - Si timestamps iguales → **Server Wins** (por consistencia)

3. **Aplicación**
   - **Local Wins**: Subir datos locales al servidor
   - **Server Wins**: Mantener datos del servidor

### Ventajas

✅ **Simplicidad**: Fácil de entender e implementar
✅ **Consistencia**: Garantiza convergencia eventual
✅ **Rendimiento**: Resolución rápida sin intervención manual
✅ **Auditoría**: Registro completo de todas las decisiones

### Consideraciones

⚠️ **Pérdida de Datos**: Los cambios más antiguos pueden perderse
⚠️ **Concurrencia**: Múltiples usuarios pueden sobrescribir cambios
⚠️ **Timestamps**: Depende de la precisión de los timestamps

## Auditoría y Monitoreo

### Tabla `conflict_resolutions`

```sql
CREATE TABLE conflict_resolutions (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  resolution_action VARCHAR(20), -- 'local_wins', 'server_wins', 'merge_required'
  resolution_message TEXT,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  local_timestamp TIMESTAMP WITH TIME ZONE,
  server_timestamp TIMESTAMP WITH TIME ZONE,
  conflict_fields TEXT[]
);
```

### Estadísticas Disponibles

- Total de conflictos por negocio
- Distribución de resoluciones (local vs server wins)
- Tiempo promedio de resolución
- Campos más conflictivos

## Configuración y Personalización

### Campos Monitoreados

Para agregar o quitar campos del monitoreo de conflictos:

```typescript
// En ConflictResolver.detectFieldConflicts()
const fieldsToCheck = [
  'client_name', 'client_phone', 'total', 
  'delivery_date', 'delivery_time', 'status', 'notes',
  // Agregar nuevos campos aquí
  'custom_field'
];
```

### Estrategias Alternativas

El sistema está diseñado para ser extensible. Se pueden implementar otras estrategias:

- **Field-Level Merging**: Combinar campos específicos
- **User Preference**: Permitir que usuarios elijan
- **Business Rules**: Reglas específicas por negocio

## Testing

### Casos de Prueba Recomendados

1. **Conflicto de Timestamps**
   - Local más reciente
   - Servidor más reciente
   - Timestamps iguales

2. **Conflictos de Campos**
   - Un solo campo conflictivo
   - Múltiples campos conflictivos
   - Sin conflictos

3. **Casos Edge**
   - Datos faltantes
   - Timestamps inválidos
   - Errores de red

### Ejemplo de Test

```typescript
describe('ConflictResolver', () => {
  it('should resolve local wins when local is newer', async () => {
    const localOrder = {
      last_modified_at: '2024-01-15T10:30:00Z',
      client_name: 'Juan'
    };
    
    const serverOrder = {
      last_modified_at: '2024-01-15T09:30:00Z',
      client_name: 'Pedro'
    };
    
    const resolution = await ConflictResolver.resolveOrderConflict(
      localOrder, 
      serverOrder
    );
    
    expect(resolution.action).toBe('local_wins');
  });
});
```

## Mantenimiento

### Limpieza de Datos

```sql
-- Eliminar registros antiguos (más de 90 días)
DELETE FROM conflict_resolutions 
WHERE resolved_at < NOW() - INTERVAL '90 days';
```

### Monitoreo de Rendimiento

- Revisar estadísticas semanalmente
- Identificar patrones de conflictos
- Optimizar campos monitoreados según uso

## Troubleshooting

### Problemas Comunes

1. **Conflictos Frecuentes**
   - Verificar sincronización de relojes
   - Revisar lógica de timestamps

2. **Pérdida de Datos**
   - Revisar logs de auditoría
   - Verificar estrategia de resolución

3. **Rendimiento Lento**
   - Optimizar índices de base de datos
   - Revisar consultas de conflicto

### Logs y Debugging

```typescript
// Habilitar logs detallados
console.log('Conflict detected:', {
  orderId: localOrder.id,
  conflicts: ConflictResolver.detectFieldConflicts(localOrder, serverOrder),
  resolution: resolution
});
``` 