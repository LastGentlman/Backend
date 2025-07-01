#!/bin/bash

# Script para aplicar migraciones de Supabase
# Incluye la tabla de conflict_resolutions

set -e

echo "🚀 Aplicando migraciones de Supabase..."

# Verificar que las variables de entorno estén configuradas
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: Variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas"
    exit 1
fi

# Directorio de migraciones
MIGRATIONS_DIR="supabase/migrations"

# Verificar que el directorio existe
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo "❌ Error: Directorio de migraciones no encontrado: $MIGRATIONS_DIR"
    exit 1
fi

# Aplicar migración de conflict_resolutions
echo "📋 Aplicando migración: conflict_resolutions.sql"

# Usar psql para aplicar la migración directamente
psql "$SUPABASE_URL" -f "$MIGRATIONS_DIR/conflict_resolutions.sql" \
    --set=ON_ERROR_STOP=on \
    --quiet

if [ $? -eq 0 ]; then
    echo "✅ Migración conflict_resolutions.sql aplicada exitosamente"
else
    echo "❌ Error aplicando migración conflict_resolutions.sql"
    exit 1
fi

echo "🎉 Todas las migraciones aplicadas exitosamente!"

# Verificar que la tabla se creó correctamente
echo "🔍 Verificando que la tabla conflict_resolutions existe..."

psql "$SUPABASE_URL" -c "\dt conflict_resolutions" --quiet

if [ $? -eq 0 ]; then
    echo "✅ Tabla conflict_resolutions verificada"
else
    echo "❌ Error: Tabla conflict_resolutions no encontrada"
    exit 1
fi

echo "📊 Verificando políticas RLS..."

psql "$SUPABASE_URL" -c "SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename = 'conflict_resolutions';" --quiet

echo "🎯 Migración completada. Sistema de resolución de conflictos listo para usar." 