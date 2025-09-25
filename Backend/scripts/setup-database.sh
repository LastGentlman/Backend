#!/bin/bash

# ===== SCRIPT DE CONFIGURACIÓN DE BASE DE DATOS PARA PEDIDOLIST =====
# Este script aplica todas las migraciones necesarias para el MVP

set -e

echo "🚀 Configurando base de datos para PedidoList..."

# Verificar que las variables de entorno estén configuradas
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: Variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas"
    echo "💡 Asegúrate de tener un archivo .env con estas variables"
    exit 1
fi

echo "✅ Variables de entorno verificadas"

# Función para ejecutar SQL en Supabase
execute_sql() {
    local file=$1
    local description=$2
    
    echo "📝 $description..."
    
    # Usar psql para ejecutar el archivo SQL
    PGPASSWORD=$SUPABASE_SERVICE_ROLE_KEY psql \
        -h $(echo $SUPABASE_URL | sed 's/https:\/\///' | sed 's/\.supabase\.co.*//').supabase.co \
        -p 5432 \
        -d postgres \
        -U postgres \
        -f "$file" \
        --set ON_ERROR_STOP=on
    
    echo "✅ $description completado"
}

# Aplicar migraciones en orden
echo ""
echo "📊 Aplicando migraciones de base de datos..."

# 1. Esquema principal
execute_sql "migrations/main_schema.sql" "Esquema principal (usuarios, negocios, pedidos)"

# 2. Procedimientos almacenados
execute_sql "migrations/stored_procedures.sql" "Procedimientos almacenados y funciones"

# 3. Integración de WhatsApp
execute_sql "migrations/whatsapp_integration.sql" "Integración de WhatsApp"

echo ""
echo "🎉 ¡Base de datos configurada exitosamente!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Verificar que las tablas se crearon correctamente en Supabase"
echo "2. Configurar las variables de entorno de WhatsApp (opcional)"
echo "3. Probar la aplicación con datos de prueba"
echo ""
echo "🔗 Dashboard de Supabase: $SUPABASE_URL"
echo ""
echo "💡 Para verificar la instalación, ejecuta:"
echo "   deno run --allow-env --allow-net test-connection.ts" 