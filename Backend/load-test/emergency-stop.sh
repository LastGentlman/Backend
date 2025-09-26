#!/bin/bash

# 🚨 Emergency Stop Script for Load Tests
# Este script detiene inmediatamente todos los tests de carga activos

echo "🚨 EMERGENCY STOP - Deteniendo todos los load tests..."

# Detener todos los procesos de k6
echo "🔄 Deteniendo procesos de k6..."
sudo pkill -9 k6 2>/dev/null || true
sudo pkill -9 -f "load-test" 2>/dev/null || true
sudo pkill -9 -f "orders_sync" 2>/dev/null || true
sudo pkill -9 -f "monitoring_load" 2>/dev/null || true

# Verificar que no hay procesos activos
echo "🔍 Verificando procesos restantes..."
K6_PROCESSES=$(ps aux | grep -v grep | grep -c k6 || true)
LOAD_PROCESSES=$(ps aux | grep -v grep | grep -c "load-test" || true)

if [ "$K6_PROCESSES" -eq 0 ] && [ "$LOAD_PROCESSES" -eq 0 ]; then
    echo "✅ Todos los procesos de load testing han sido detenidos"
else
    echo "⚠️  Algunos procesos pueden seguir activos:"
    ps aux | grep -v grep | grep -E "(k6|load-test)" || echo "   (Ninguno encontrado)"
    
    # Intentar con kill más agresivo
    echo "🔨 Intentando kill más agresivo..."
    sudo killall -9 k6 2>/dev/null || true
    sudo killall -9 node 2>/dev/null || true
fi

# Limpiar archivos temporales si existen
echo "🧹 Limpiando archivos temporales..."
rm -f /tmp/k6-* 2>/dev/null || true
rm -f /tmp/load-test-* 2>/dev/null || true

# Mostrar estado del servidor
echo "📊 Estado del servidor:"
if command -v curl &> /dev/null; then
    echo "   Probando conexión..."
    curl -s -o /dev/null -w "   Server status: %{http_code}\n" http://localhost:3030/health || echo "   ❌ No se puede conectar al servidor"
else
    echo "   (curl no disponible para verificar)"
fi

echo ""
echo "🎯 SOLUCIÓN para evitar el loop infinito:"
echo "1. ✅ Procesos detenidos"
echo "2. 🔑 Obtén un token válido:"
echo "   curl -X POST http://localhost:3030/api/auth/login \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"email\":\"tu-email@ejemplo.com\",\"password\":\"tu-password\"}'"
echo ""
echo "3. 🧪 Ejecuta el test corregido:"
echo "   LOAD_TEST_TOKEN=\"tu-token-aquí\" k6 run orders_sync_load_fixed.ts"
echo ""
echo "✅ Emergency stop completado" 