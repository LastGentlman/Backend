#!/bin/bash

# Script para aplicar la migración de current_business_id
# Este script aplica la migración add_current_business_id.sql

set -e

echo "🚀 Aplicando migración: add_current_business_id.sql"

# Verificar que las variables de entorno estén configuradas
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: Variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas"
    echo "💡 Puedes configurarlas temporalmente con:"
    echo "   export SUPABASE_URL='your_supabase_url'"
    echo "   export SUPABASE_SERVICE_ROLE_KEY='your_service_role_key'"
    exit 1
fi

# Aplicar la migración
echo "📋 Aplicando migración: add_current_business_id.sql"

psql "$SUPABASE_URL" -f "migrations/add_current_business_id.sql" \
    --set=ON_ERROR_STOP=on \
    --quiet

if [ $? -eq 0 ]; then
    echo "✅ Migración add_current_business_id.sql aplicada exitosamente"
else
    echo "❌ Error aplicando migración add_current_business_id.sql"
    exit 1
fi

echo "🎉 Migración completada exitosamente!"

# Verificar que la columna se agregó correctamente
echo "🔍 Verificando que la columna current_business_id existe..."

psql "$SUPABASE_URL" -c "\d profiles" --quiet | grep current_business_id

if [ $? -eq 0 ]; then
    echo "✅ Columna current_business_id verificada"
else
    echo "❌ Error: Columna current_business_id no encontrada"
    exit 1
fi

echo "🎯 Migración completada. Campo current_business_id listo para usar."
