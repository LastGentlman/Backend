#!/bin/bash

# Script para probar la integración de email
echo "🧪 Probando integración de email..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para imprimir con colores
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Verificar que estamos en el directorio correcto
if [ ! -f "services/EmailNotificationService.ts" ]; then
    print_error "No se encontró EmailNotificationService.ts"
    echo "Asegúrate de estar en el directorio Backend/"
    exit 1
fi

print_status "Verificando estructura de archivos..."

# Verificar archivos necesarios
FILES=(
    "services/EmailNotificationService.ts"
    "supabase/functions/send-notification-email/index.ts"
    "supabase/functions/send-notification-email/deno.json"
    "scripts/deploy-email-function.sh"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        print_status "✓ $file"
    else
        print_error "✗ $file (faltante)"
    fi
done

echo ""
print_status "Verificando configuración de Supabase..."

# Verificar si supabase CLI está disponible
if ! npx supabase --version &> /dev/null; then
    print_warning "Supabase CLI no está disponible"
    echo "Instala con: npm install supabase"
else
    print_status "Supabase CLI está disponible (vía npx)"
fi

# Verificar si el proyecto está inicializado
if [ -d "supabase" ] && [ -f "supabase/config.toml" ]; then
    print_status "Proyecto Supabase inicializado"
else
    print_warning "Proyecto Supabase no inicializado"
    echo "Ejecuta: npx supabase init"
fi

echo ""
print_status "Verificando función de email..."

# Verificar si la función existe
if [ -d "supabase/functions/send-notification-email" ]; then
    print_status "Función send-notification-email encontrada"
    
    # Verificar archivos de la función
    FUNCTION_FILES=(
        "supabase/functions/send-notification-email/index.ts"
        "supabase/functions/send-notification-email/deno.json"
    )
    
    for file in "${FUNCTION_FILES[@]}"; do
        if [ -f "$file" ]; then
            print_status "✓ $file"
        else
            print_error "✗ $file (faltante)"
        fi
    done
else
    print_error "Función send-notification-email no encontrada"
fi

echo ""
print_status "Verificando variables de entorno..."

# Verificar archivo .env si existe
if [ -f ".env" ]; then
    print_status "Archivo .env encontrado"
    
    # Verificar variables importantes
    if grep -q "RESEND_API_KEY" .env; then
        print_status "✓ RESEND_API_KEY configurada"
    else
        print_warning "⚠️  RESEND_API_KEY no encontrada en .env"
    fi
    
    if grep -q "RESEND_FROM_EMAIL" .env; then
        print_status "✓ RESEND_FROM_EMAIL configurada"
    else
        print_warning "⚠️  RESEND_FROM_EMAIL no encontrada en .env"
    fi
else
    print_warning "Archivo .env no encontrado"
fi

echo ""
print_status "Resumen de configuración requerida:"

echo "📋 Para completar la configuración:"
echo ""
echo "1. Obtén tu API key de Resend:"
echo "   - Ve a https://resend.com/dashboard"
echo "   - Haz clic en 'API Keys' en el sidebar"
echo "   - Copia tu API key (empieza con 're_')"
echo ""
echo "2. Agrega las variables a tu archivo .env:"
echo "   RESEND_API_KEY=tu_api_key_de_resend"
echo "   RESEND_FROM_EMAIL=noreply@tudominio.com"
echo "   RESEND_FROM_NAME=PedidoList"
echo ""
echo "3. Prueba la integración:"
echo "   curl -X POST http://localhost:8000/api/auth/account \\"
echo "     -H 'Authorization: Bearer tu-token' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"confirmation\": \"ELIMINAR MI CUENTA\"}'"
echo ""

print_status "¡Verificación completada!" 