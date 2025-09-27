#!/bin/bash

# ===== SCRIPT PARA HABILITAR PROTECCIÓN DE CONTRASEÑAS FILTRADAS =====
# Este script proporciona instrucciones para habilitar la protección contra contraseñas comprometidas

set -e

echo "🔐 Configurando protección de contraseñas filtradas..."

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para mostrar mensajes
show_message() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

show_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

show_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_instruction() {
    echo -e "${BLUE}[INSTRUCCIÓN]${NC} $1"
}

# Verificar si tenemos acceso a Supabase CLI
check_supabase_cli() {
    show_message "Verificando Supabase CLI..."
    
    if ! command -v supabase &> /dev/null; then
        show_error "Supabase CLI no está instalado."
        show_instruction "Instálalo con: npm install -g supabase"
        show_instruction "O visita: https://supabase.com/docs/guides/cli/getting-started"
        exit 1
    fi
    
    show_message "✅ Supabase CLI está instalado"
}

# Mostrar instrucciones para habilitar protección de contraseñas
show_password_protection_instructions() {
    echo ""
    echo "🔐 HABILITAR PROTECCIÓN DE CONTRASEÑAS FILTRADAS"
    echo "================================================"
    echo ""
    echo "Para habilitar la protección contra contraseñas filtradas:"
    echo ""
    show_instruction "1. Ve a tu dashboard de Supabase"
    show_instruction "2. Navega a Authentication > Settings"
    show_instruction "3. Busca la sección 'Password Protection'"
    show_instruction "4. Habilita 'Leaked Password Protection'"
    echo ""
    echo "Esto activará la verificación automática contra la base de datos"
    echo "HaveIBeenPwned.org para prevenir el uso de contraseñas comprometidas."
    echo ""
    echo "📚 Documentación oficial:"
    echo "   https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection"
    echo ""
}

# Mostrar configuración alternativa via CLI
show_cli_alternative() {
    echo ""
    echo "🔧 ALTERNATIVA: Configuración via CLI"
    echo "====================================="
    echo ""
    show_instruction "Si tienes acceso al proyecto localmente, puedes usar:"
    echo ""
    echo "1. Inicializar proyecto local:"
    echo "   supabase init"
    echo ""
    echo "2. Vincular con tu proyecto remoto:"
    echo "   supabase link --project-ref TU_PROJECT_REF"
    echo ""
    echo "3. Configurar variables de entorno:"
    echo "   export SUPABASE_URL=tu_url"
    echo "   export SUPABASE_ANON_KEY=tu_anon_key"
    echo ""
    echo "4. Aplicar configuración:"
    echo "   supabase db push"
    echo ""
}

# Verificar configuración actual
check_current_config() {
    show_message "Verificando configuración actual..."
    
    if [ -f "supabase/config.toml" ]; then
        show_message "✅ Archivo config.toml encontrado"
        
        # Verificar si ya está configurado
        if grep -q "password_requirements" supabase/config.toml; then
            show_message "✅ Configuración de contraseñas ya presente en config.toml"
        else
            show_warning "⚠️  Configuración de contraseñas no encontrada en config.toml"
        fi
    else
        show_warning "⚠️  Archivo config.toml no encontrado"
    fi
}

# Mostrar configuración recomendada
show_recommended_config() {
    echo ""
    echo "📋 CONFIGURACIÓN RECOMENDADA"
    echo "============================"
    echo ""
    echo "Para tu archivo config.toml, asegúrate de tener:"
    echo ""
    echo "[auth]"
    echo "enable_signup = true"
    echo "enable_confirmations = true"
    echo "minimum_password_length = 8"
    echo "password_requirements = \"lower_upper_letters_digits_symbols\""
    echo ""
    echo "Y en el dashboard de Supabase:"
    echo "- Habilitar 'Leaked Password Protection'"
    echo "- Configurar 'Password Strength Requirements'"
    echo ""
}

# Función principal
main() {
    echo "🚀 Configurando protección de contraseñas filtradas..."
    echo ""
    
    check_supabase_cli
    check_current_config
    show_password_protection_instructions
    show_cli_alternative
    show_recommended_config
    
    echo ""
    show_message "✅ Instrucciones completadas!"
    echo ""
    echo "📋 RESUMEN DE ACCIONES REQUERIDAS:"
    echo "=================================="
    echo "1. ⏳ Ir al dashboard de Supabase"
    echo "2. ⏳ Navegar a Authentication > Settings"
    echo "3. ⏳ Habilitar 'Leaked Password Protection'"
    echo "4. ⏳ Configurar requisitos de contraseña"
    echo ""
    echo "Una vez completadas estas acciones, la warning de protección"
    echo "de contraseñas filtradas debería estar resuelta."
    echo ""
}

# Ejecutar función principal
main "$@"
