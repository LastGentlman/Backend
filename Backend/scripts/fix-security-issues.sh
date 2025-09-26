#!/bin/bash

# ===== SCRIPT PARA SOLUCIONAR PROBLEMAS DE SEGURIDAD DETECTADOS POR SUPABASE LINTER =====
# Este script aplica las correcciones necesarias para los warnings del linter de Supabase

set -e

echo "🔧 Aplicando correcciones de seguridad para la base de datos..."

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

# Verificar si tenemos acceso a Supabase
check_supabase_connection() {
    show_message "Verificando conexión con Supabase..."
    
    if ! command -v supabase &> /dev/null; then
        show_error "Supabase CLI no está instalado. Instálalo con: npm install -g supabase"
        exit 1
    fi
    
    if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
        show_warning "Variables de entorno SUPABASE_URL y SUPABASE_ANON_KEY no están configuradas"
        show_warning "Asegúrate de tener acceso al proyecto de Supabase"
    fi
}

# Aplicar migración de funciones
apply_function_security_migration() {
    show_message "Aplicando migración de seguridad para funciones..."
    
    local migration_file="$(dirname "$0")/../migrations/fix_function_security.sql"
    
    if [ ! -f "$migration_file" ]; then
        show_error "Archivo de migración no encontrado: $migration_file"
        exit 1
    fi
    
    show_message "Ejecutando migración desde: $migration_file"
    show_warning "Nota: Debes ejecutar este script SQL en el SQL Editor de Supabase manualmente"
    show_warning "O usar supabase db push si tienes configurado el proyecto localmente"
    
    echo ""
    echo "📋 Archivo de migración creado en:"
    echo "   $migration_file"
    echo ""
    echo "🔧 Para aplicar los cambios:"
    echo "   1. Copia el contenido del archivo de migración"
    echo "   2. Ve al SQL Editor en tu dashboard de Supabase"
    echo "   3. Pega y ejecuta el script"
    echo "   4. O usa: supabase db push (si tienes proyecto local configurado)"
}

# Mostrar instrucciones para habilitar protección de contraseñas filtradas
show_password_protection_instructions() {
    show_message "Instrucciones para habilitar protección de contraseñas filtradas..."
    
    echo ""
    echo "🔐 PROTECCIÓN DE CONTRASEÑAS FILTRADAS"
    echo "======================================"
    echo ""
    echo "Para habilitar la protección contra contraseñas filtradas:"
    echo ""
    echo "1. Ve a tu dashboard de Supabase"
    echo "2. Navega a Authentication > Settings"
    echo "3. Busca la sección 'Password Protection'"
    echo "4. Habilita 'Leaked Password Protection'"
    echo ""
    echo "Esto activará la verificación automática contra la base de datos"
    echo "HaveIBeenPwned.org para prevenir el uso de contraseñas comprometidas."
    echo ""
    echo "📚 Documentación oficial:"
    echo "   https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection"
    echo ""
}

# Función principal
main() {
    echo "🚀 Iniciando proceso de corrección de seguridad..."
    echo ""
    
    check_supabase_connection
    apply_function_security_migration
    show_password_protection_instructions
    
    echo ""
    show_message "✅ Proceso completado!"
    echo ""
    echo "📋 RESUMEN DE ACCIONES REQUERIDAS:"
    echo "================================="
    echo "1. ✅ Archivos de migración creados"
    echo "2. ⏳ Aplicar migración SQL en Supabase (pendiente)"
    echo "3. ⏳ Habilitar protección de contraseñas filtradas (pendiente)"
    echo ""
    echo "Una vez completadas estas acciones, todos los warnings del linter"
    echo "de Supabase deberían estar resueltos."
}

# Ejecutar función principal
main "$@" 