# 🚨 Solución al Problema del Infinite Loop

## Problema Identificado

El infinite loop en los logs era causado por tests de carga (k6) ejecutándose continuamente con un token JWT falso, resultando en errores 403 repetitivos.

### Síntomas

- Logs repetitivos de error 403 (Forbidden)
- Alto uso de CPU/memoria
- Servidor no responde correctamente
- Token de ejemplo "John Doe" siendo usado

## ✅ Solución Implementada

### 1. Test de Carga Deshabilitado

- El archivo `orders_sync_load.ts` ahora tiene el test deshabilitado por defecto
- Comentarios claros sobre cómo habilitarlo correctamente

### 2. Script de Configuración Automática

```bash
# Configurar token válido automáticamente
./load-test/setup-test-token.sh
```

### 3. Script de Emergencia

```bash
# Detener todos los tests de carga inmediatamente
./load-test/emergency-stop.sh
```

## 🔧 Uso Correcto de Tests de Carga

### Opción 1: Configuración Automática (Recomendada)

```bash
# 1. Iniciar servidor
deno run --allow-net --allow-env --allow-read main.ts

# 2. Configurar token válido
./load-test/setup-test-token.sh

# 3. Ejecutar test
source load-test/test-token.env
k6 run load-test/orders_sync_load.ts
```

### Opción 2: Configuración Manual

```bash
# 1. Registrar usuario
curl -X POST http://localhost:3030/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@ejemplo.com", "password": "test123", "name": "Test User"}'

# 2. Obtener token
curl -X POST http://localhost:3030/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@ejemplo.com", "password": "test123"}'

# 3. Actualizar TEST_TOKEN en orders_sync_load.ts
# 4. Habilitar test (descomentar export const options)
# 5. Ejecutar: k6 run load-test/orders_sync_load.ts
```

## 🚨 Prevención de Problemas Futuros

### 1. Verificaciones Antes de Ejecutar

- ✅ Servidor ejecutándose en puerto 3030
- ✅ Token válido configurado
- ✅ Usuario de prueba creado
- ✅ Endpoint `/health` responde correctamente

### 2. Monitoreo Durante Tests

```bash
# Verificar procesos activos
ps aux | grep k6

# Verificar logs del servidor
tail -f logs/server.log

# Verificar uso de recursos
htop
```

### 3. Detención de Emergencia

```bash
# Detener todos los tests
./load-test/emergency-stop.sh

# O manualmente
pkill -f k6
pkill -9 -f k6  # Si es necesario
```

## 📊 Métricas de Monitoreo

### Métricas Correctas

- `sync_success_rate` > 90%
- `http_req_duration` < 2s (p95)
- `http_req_failed` < 10%

### Señales de Problema

- `http_req_failed` > 50% (posible token inválido)
- `sync_success_rate` < 50% (problemas de autenticación)
- Logs repetitivos de error 403

## 🔍 Troubleshooting

### Error 403 Repetitivo

```bash
# 1. Detener tests
./load-test/emergency-stop.sh

# 2. Verificar token
curl -H "Authorization: Bearer $TEST_TOKEN" http://localhost:3030/api/auth/me

# 3. Regenerar token si es necesario
./load-test/setup-test-token.sh
```

### Servidor No Responde

```bash
# 1. Verificar que el servidor esté ejecutándose
ps aux | grep deno

# 2. Reiniciar si es necesario
pkill -f "deno.*main.ts"
deno run --allow-net --allow-env --allow-read main.ts
```

### Alto Uso de Recursos

```bash
# 1. Detener tests inmediatamente
./load-test/emergency-stop.sh

# 2. Verificar procesos zombi
ps aux | grep -E "(k6|load-test)"

# 3. Limpiar recursos
sudo systemctl restart systemd-oomd  # Si está disponible
```

## 📝 Checklist de Seguridad

- [ ] Tests deshabilitados por defecto
- [ ] Token válido requerido para ejecución
- [ ] Script de emergencia disponible
- [ ] Documentación clara sobre uso correcto
- [ ] Monitoreo de recursos implementado
- [ ] Verificaciones de salud antes de ejecutar

## 🎯 Próximos Pasos

1. **Implementar monitoreo automático** de tests de carga
2. **Crear dashboard** para métricas de rendimiento
3. **Automatizar** la detección de problemas
4. **Implementar rate limiting** en endpoints de test
5. **Crear ambiente de staging** separado para tests

## 📞 Contacto

Para problemas técnicos:

- Revisar logs del servidor
- Usar script de emergencia
- Consultar documentación de k6
- Verificar configuración de autenticación
