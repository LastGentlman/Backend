# Load Testing para Orders Sync

## 🚨 IMPORTANTE: Evitar Infinite Loops

**PROBLEMA COMÚN**: Los tests de carga pueden causar infinite loops si se ejecutan con tokens inválidos, resultando en errores 403 repetitivos.

### ✅ Solución Recomendada

1. **Configurar token válido automáticamente**:

   ```bash
   # Ejecutar el script de configuración
   ./load-test/setup-test-token.sh
   ```

2. **Ejecutar test con token válido**:

   ```bash
   # Cargar variables de entorno
   source load-test/test-token.env
   
   # Ejecutar test
   k6 run orders_sync_load.ts
   ```

### ❌ Lo que NO hacer

- **NO ejecutar tests con tokens falsos** (como el token de ejemplo "John Doe")
- **NO ejecutar tests sin verificar que el servidor esté funcionando**
- **NO ejecutar tests sin autenticación válida**

## Configuración Manual

Si prefieres configurar manualmente:

1. **Iniciar servidor**:

   ```bash
   deno run --allow-net --allow-env --allow-read main.ts
   ```

2. **Registrar usuario de prueba**:

   ```bash
   curl -X POST http://localhost:3030/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@ejemplo.com",
       "password": "test123",
       "name": "Test User"
     }'
   ```

3. **Obtener token**:

   ```bash
   curl -X POST http://localhost:3030/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@ejemplo.com",
       "password": "test123"
     }'
   ```

4. **Actualizar TEST_TOKEN en orders_sync_load.ts**

## Tests Disponibles

- `orders_sync_load.ts` - Test de carga para sincronización de órdenes
- `monitoring_load.ts` - Test de carga para endpoints de monitoreo
- `quick-test.ts` - Test rápido para verificar funcionalidad básica

## Monitoreo

Los tests generan métricas personalizadas:

- `sync_success_rate` - Tasa de éxito de sincronización
- `sync_duration` - Duración de las operaciones de sync

## Troubleshooting

### Error 403 (Forbidden)

- Verificar que el token sea válido
- Verificar que el usuario tenga permisos
- Usar `setup-test-token.sh` para obtener token válido

### Error de conexión

- Verificar que el servidor esté ejecutándose en puerto 3030
- Verificar firewall/red

### Infinite Loop

- Detener procesos: `pkill -f k6`
- Verificar logs del servidor
- Usar token válido en lugar del token de ejemplo
