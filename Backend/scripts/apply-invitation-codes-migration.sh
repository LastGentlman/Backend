#!/bin/bash

# ===== SCRIPT PARA APLICAR MIGRACIÓN DE CÓDIGOS DE INVITACIÓN =====
# Este script aplica la migración del sistema de códigos de invitación

set -e  # Salir si hay algún error

echo "🚀 Aplicando migración de códigos de invitación..."

# Verificar que estamos en el directorio correcto
if [ ! -f "deno.json" ]; then
    echo "❌ Error: Debes ejecutar este script desde el directorio Backend/"
    exit 1
fi

# Verificar que existe el archivo de migración
MIGRATION_FILE="migrations/business_invitation_codes.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Error: No se encontró el archivo de migración: $MIGRATION_FILE"
    exit 1
fi

echo "📁 Archivo de migración encontrado: $MIGRATION_FILE"

# Verificar variables de entorno
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "⚠️  Advertencia: Variables de entorno SUPABASE_URL o SUPABASE_ANON_KEY no configuradas"
    echo "   Asegúrate de configurar estas variables antes de continuar"
    echo ""
    echo "   Ejemplo:"
    echo "   export SUPABASE_URL='https://tu-proyecto.supabase.co'"
    echo "   export SUPABASE_ANON_KEY='tu-anon-key'"
    echo ""
    read -p "¿Continuar de todas formas? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Migración cancelada"
        exit 1
    fi
fi

echo "🔧 Aplicando migración a la base de datos..."

# Opción 1: Usar psql directamente (si tienes acceso)
if command -v psql &> /dev/null; then
    echo "📊 Usando psql para aplicar la migración..."
    
    # Construir string de conexión
    if [ ! -z "$SUPABASE_URL" ] && [ ! -z "$SUPABASE_ANON_KEY" ]; then
        # Extraer host y database de la URL
        HOST=$(echo $SUPABASE_URL | sed 's|https://||' | sed 's|http://||')
        DB_NAME="postgres"
        
        echo "🔗 Conectando a: $HOST"
        
        # Aplicar migración
        psql "postgresql://postgres:$SUPABASE_ANON_KEY@$HOST:5432/$DB_NAME" \
            -f "$MIGRATION_FILE" \
            --set ON_ERROR_STOP=on \
            --echo-all
    else
        echo "❌ No se pueden construir las credenciales de conexión"
        exit 1
    fi
else
    echo "⚠️  psql no está disponible. Usando método alternativo..."
    
    # Opción 2: Usar Deno con Supabase client
    echo "🦕 Usando Deno para aplicar la migración..."
    
    # Crear script temporal
    TEMP_SCRIPT=$(mktemp)
    cat > "$TEMP_SCRIPT" << 'EOF'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables de entorno SUPABASE_URL y SUPABASE_ANON_KEY son requeridas')
  Deno.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Leer archivo de migración
const migrationSQL = await Deno.readTextFile('migrations/business_invitation_codes.sql')

console.log('🔧 Aplicando migración...')

try {
  // Ejecutar migración
  const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL })
  
  if (error) {
    console.error('❌ Error al aplicar migración:', error)
    Deno.exit(1)
  }
  
  console.log('✅ Migración aplicada exitosamente')
} catch (error) {
  console.error('❌ Error inesperado:', error)
  Deno.exit(1)
}
EOF

    # Ejecutar script
    deno run --allow-env --allow-read "$TEMP_SCRIPT"
    
    # Limpiar
    rm "$TEMP_SCRIPT"
fi

echo ""
echo "✅ Migración completada exitosamente!"
echo ""
echo "📋 Resumen de lo que se implementó:"
echo "   • Tabla business_invitation_codes para almacenar códigos"
echo "   • Tabla business_invitation_usage para tracking de uso"
echo "   • Función generate_invitation_code() para generar códigos únicos"
echo "   • Función use_invitation_code() para validar y usar códigos"
echo "   • Función cleanup_expired_invitation_codes() para limpieza automática"
echo "   • Políticas de seguridad RLS configuradas"
echo "   • Índices para optimizar performance"
echo ""
echo "🚀 El sistema de códigos de invitación está listo para usar!"
echo ""
echo "💡 Próximos pasos:"
echo "   1. Reiniciar el servidor backend"
echo "   2. Probar el endpoint /api/business/join"
echo "   3. Crear códigos de invitación desde el dashboard"
echo "   4. Configurar limpieza automática de códigos expirados" 