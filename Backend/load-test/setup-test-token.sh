#!/bin/bash

# Script para configurar token válido para tests de carga
echo "🔧 Configurando token válido para tests de carga..."

# Verificar que el servidor esté ejecutándose
echo "📡 Verificando que el servidor esté ejecutándose..."
if ! curl -s http://localhost:3030/health > /dev/null; then
    echo "❌ Error: El servidor no está ejecutándose en localhost:3030"
    echo "💡 Inicia el servidor con: deno run --allow-net --allow-env --allow-read main.ts"
    exit 1
fi

echo "✅ Servidor está ejecutándose"

# Crear usuario de prueba
echo "👤 Creando usuario de prueba..."
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3030/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "loadtest@ejemplo.com",
    "password": "loadtest123",
    "name": "Load Test User"
  }')

echo "📝 Respuesta de registro: $REGISTER_RESPONSE"

# Verificar si el registro fue exitoso o si el usuario ya existe
if echo "$REGISTER_RESPONSE" | grep -q "already exists\|duplicate"; then
    echo "ℹ️  Usuario ya existe, continuando con login..."
elif echo "$REGISTER_RESPONSE" | grep -q "error"; then
    echo "⚠️  Error en registro, intentando login con usuario existente..."
else
    echo "✅ Usuario creado exitosamente"
fi

# Hacer login para obtener token
echo "🔑 Obteniendo token de autenticación..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3030/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "loadtest@ejemplo.com",
    "password": "loadtest123"
  }')

echo "📝 Respuesta de login: $LOGIN_RESPONSE"

# Extraer token del response
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "❌ Error: No se pudo extraer el token del response"
    echo "💡 Verifica que el login fue exitoso"
    echo "💡 Intenta con un usuario existente:"
    echo "   curl -X POST http://localhost:3030/api/auth/login \\"
    echo "     -H 'Content-Type: application/json' \\"
    echo "     -d '{\"email\":\"tu-email@ejemplo.com\",\"password\":\"tu-password\"}'"
    exit 1
fi

echo "✅ Token obtenido: ${TOKEN:0:20}..."

# Verificar que el token es válido
echo "🔐 Verificando que el token es válido..."
AUTH_CHECK=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3030/api/auth/profile)

if echo "$AUTH_CHECK" | grep -q "error\|401\|403"; then
    echo "❌ Error: El token no es válido"
    echo "💡 Intenta obtener un nuevo token"
    exit 1
fi

echo "✅ Token verificado correctamente"

# Crear archivo de configuración
cat > load-test/test-token.env << EOF
# Token válido para tests de carga
# Generado automáticamente por setup-test-token.sh
# Fecha: $(date)
LOAD_TEST_TOKEN=$TOKEN
BASE_URL=http://localhost:3030
EOF

echo "💾 Token guardado en load-test/test-token.env"
echo "🎯 Ahora puedes ejecutar los tests de carga con un token válido"
echo ""
echo "💡 Para usar:"
echo "   source load-test/test-token.env"
echo "   k6 run orders_sync_load_fixed.ts"
echo ""
echo "🚨 Para detener tests de emergencia:"
echo "   ./load-test/emergency-stop.sh" 