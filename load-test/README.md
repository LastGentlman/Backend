# 🚀 Load Testing con k6

Este directorio contiene scripts de carga (load tests) para validar el rendimiento de los endpoints críticos de la aplicación PedidoList.

## 📋 Endpoints Testeados

### 1. **Orders Sync** (`orders_sync_load.ts`)

- **Endpoint:** `POST /api/orders/sync`
- **Propósito:** Sincronización de órdenes offline con resolución de conflictos
- **Carga:** 10-20 usuarios concurrentes
- **Duración:** 16 minutos total

### 2. **Monitoring** (`monitoring_load.ts`)

- **Endpoints:** 
  - `POST /api/monitoring/check`
  - `GET /api/monitoring/alerts`
  - `POST /api/monitoring/test-alert`
- **Propósito:** Monitoreo de métricas y alertas
- **Carga:** 5-10 usuarios concurrentes
- **Duración:** 9 minutos total

## 🛠️ Instalación de k6

### Ubuntu/Debian

```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### macOS

```bash
brew install k6
```

### Windows

```bash
choco install k6
```

### Verificar instalación

```bash
k6 version
```

## ⚙️ Configuración

### 1. Variables de Entorno

Los scripts usan variables de entorno para configuración:

```bash
# URL del servidor (por defecto: http://localhost:3030)
export BASE_URL="http://localhost:3030"

# Para testing en staging/producción
export BASE_URL="https://api.pedidolist.com"
```

### 2. Token de Autenticación

**⚠️ IMPORTANTE:** Los scripts usan un token de prueba. Para testing real:

I. Obtén un token válido:

```bash
curl -X POST http://localhost:3030/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

II. Reemplaza `TEST_TOKEN` en los scripts con el token real.

## 🏃‍♂️ Ejecución

### Setup Rápido (Recomendado)

```bash
# Ejecutar el script de setup automático
cd load-test
./setup.sh

# Ejecutar tests con el script generado
./run-load-tests.sh [orders|monitoring|all]
```

### Opción 1: Ejecutar directamente con k6

```bash
# Test rápido (verificación inicial)
k6 run load-test/quick-test.ts

# Test de sincronización de órdenes
k6 run load-test/orders_sync_load.ts

# Test de monitoreo
k6 run load-test/monitoring_load.ts

# Con variables de entorno
BASE_URL="http://localhost:3030" k6 run load-test/orders_sync_load.ts
```

### Opción 2: Compilar TypeScript a JavaScript

Si prefieres usar JavaScript:

```bash
# Instalar TypeScript globalmente
npm install -g typescript

# Compilar los scripts
tsc load-test/orders_sync_load.ts --target es2020 --module es2020 --outDir load-test/dist/
tsc load-test/monitoring_load.ts --target es2020 --module es2020 --outDir load-test/dist/

# Ejecutar versión compilada
k6 run load-test/dist/orders_sync_load.js
k6 run load-test/dist/monitoring_load.js
```

### Opción 3: Usar k6 con soporte experimental de TypeScript

```bash
# Instalar k6 con soporte TypeScript
go install go.k6.io/xk6/cmd/xk6@latest
xk6 build --with github.com/grafana/xk6-typescript@latest

# Ejecutar con el binario personalizado
./k6 run load-test/orders_sync_load.ts
```

## 📊 Interpretación de Resultados

### Métricas Principales

- **http_req_duration**: Tiempo de respuesta (p95 < 2-3s)
- **http_req_failed**: Tasa de errores (< 5-10%)
- **sync_success_rate**: Tasa de éxito de sincronización (> 90%)
- **monitoring_success_rate**: Tasa de éxito de monitoreo (> 95%)

### Ejemplo de Output

```bash
     █ setup

     █ teardown

     checks.........................: 100.00% ✓ 1000 ✗ 0
     data_received..................: 1.2 MB  13 kB/s
     data_sent......................: 890 kB  9.5 kB/s
     http_req_blocked...............: avg=1.2ms   min=0s      med=1ms     max=15ms    p(95)=2ms     p(99)=5ms
     http_req_connecting............: avg=0.5ms   min=0s      med=0s      max=8ms     p(95)=1ms     p(99)=3ms
     http_req_duration..............: avg=150ms   min=50ms    med=120ms   max=800ms   p(95)=300ms   p(99)=500ms
     http_req_failed................: 0.00%   ✓ 1000 ✗ 0
     http_req_receiving.............: avg=2.1ms   min=1ms     med=2ms     max=10ms    p(95)=3ms     p(99)=5ms
     http_req_sending...............: avg=0.8ms   min=0s      med=1ms     max=5ms     p(95)=2ms     p(99)=3ms
     http_req_tls_handshaking.......: avg=0s      min=0s      med=0s      max=0s      p(95)=0s      p(99)=0s
     http_req_waiting...............: avg=147ms   min=48ms    med=117ms   max=795ms   p(95)=295ms   p(99)=495ms
     http_reqs......................: 1000    10.7/s
     iteration_duration.............: avg=1.15s   min=1.05s   med=1.12s   max=1.8s    p(95)=1.3s    p(99)=1.5s
     iterations.....................: 1000    10.7/s
     sync_success_rate..............: 100.00% ✓ 1000 ✗ 0
     vus............................: 10      min=10     max=10
     vus_max........................: 10      min=10     max=10
```

## 🔧 Personalización

### Modificar Carga

Edita las opciones en los scripts:

```typescript
export const options = {
  stages: [
    { duration: '2m', target: 10 },  // Ramp up
    { duration: '5m', target: 10 },  // Mantener carga
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // Umbral de latencia
    http_req_failed: ['rate<0.1'],     // Umbral de errores
  },
};
```

### Agregar Nuevos Endpoints

1. Copia un script existente
2. Modifica la función principal
3. Ajusta las métricas y thresholds
4. Ejecuta con `k6 run`

## 🚨 Troubleshooting

### Error: "Cannot find module 'k6/http'"

- **Causa:** k6 tiene su propio sistema de módulos
- **Solución:** Ejecutar directamente con `k6 run`, no con `deno run`

### Error: "Server not accessible"

- **Causa:** El servidor no está corriendo
- **Solución:** Iniciar el servidor: `deno run --allow-all main.ts`

### Error: "401 Unauthorized"

- **Causa:** Token inválido
- **Solución:** Obtener un token válido y actualizar `TEST_TOKEN`

### Performance Issues

- **Latencia alta:** Revisar logs del servidor, base de datos
- **Errores 500:** Verificar logs de errores, configuración de Supabase
- **Timeouts:** Ajustar thresholds en los scripts

## 📈 Monitoreo en Tiempo Real

### Grafana + InfluxDB (Opcional)

```bash
# Iniciar InfluxDB
docker run -d -p 8086:8086 influxdb:1.8

# Iniciar Grafana
docker run -d -p 3000:3000 grafana/grafana

# Ejecutar test con output a InfluxDB
k6 run --out influxdb=http://localhost:8086/k6 load-test/orders_sync_load.ts
```

## 🔄 Integración con CI/CD

### GitHub Actions Example

```yaml
name: Load Tests
on: [push, pull_request]
jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install k6
        run: |
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6
      - name: Start Backend
        run: deno run --allow-all main.ts &
      - name: Wait for server
        run: sleep 10
      - name: Run Load Tests
        run: |
          k6 run load-test/orders_sync_load.ts
          k6 run load-test/monitoring_load.ts
```

## 📞 Soporte

Para problemas técnicos:

- Revisar logs del servidor
- Verificar configuración de Supabase
- Consultar documentación de k6: [https://k6.io/docs/](https://k6.io/docs/)
