#!/bin/bash

# Script para aplicar procedimientos almacenados a Supabase
# Incluye funciones de seguridad y monitoreo

set -e

echo "🚀 Aplicando procedimientos almacenados a Supabase..."

# Verificar que las variables de entorno estén configuradas
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: Variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas"
    exit 1
fi

# Archivo de migración
MIGRATION_FILE="Backend/migrations/stored_procedures.sql"

# Verificar que el archivo existe
if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Error: Archivo de migración no encontrado: $MIGRATION_FILE"
    exit 1
fi

echo "📋 Aplicando migración: stored_procedures.sql"

# Usar psql para aplicar la migración directamente
psql "$SUPABASE_URL" -f "$MIGRATION_FILE" \
    --set=ON_ERROR_STOP=on \
    --quiet

if [ $? -eq 0 ]; then
    echo "✅ Migración stored_procedures.sql aplicada exitosamente"
else
    echo "❌ Error aplicando migración stored_procedures.sql"
    exit 1
fi

echo "🔍 Verificando que las funciones se crearon correctamente..."

# Verificar funciones principales
FUNCTIONS=(
    "get_conflict_stats"
    "get_database_size"
    "get_query_performance_stats"
    "cleanup_old_logs"
    "get_sync_stats"
    "get_active_users_stats"
    "get_orders_stats"
    "sanitize_text"
    "log_suspicious_activity"
)

for func in "${FUNCTIONS[@]}"; do
    echo "  Verificando función: $func"
    psql "$SUPABASE_URL" -c "SELECT proname FROM pg_proc WHERE proname = '$func';" --quiet | grep -q "$func"
    
    if [ $? -eq 0 ]; then
        echo "    ✅ Función $func verificada"
    else
        echo "    ❌ Error: Función $func no encontrada"
        exit 1
    fi
done

echo "📊 Verificando índices..."

# Verificar índices principales
INDEXES=(
    "idx_conflict_resolutions_order_id"
    "idx_query_logs_created_at"
    "idx_error_logs_created_at"
    "idx_sync_queue_created_at"
    "idx_user_sessions_last_activity"
    "idx_security_logs_created_at"
)

for idx in "${INDEXES[@]}"; do
    echo "  Verificando índice: $idx"
    psql "$SUPABASE_URL" -c "SELECT indexname FROM pg_indexes WHERE indexname = '$idx';" --quiet | grep -q "$idx" || echo "    ⚠️ Índice $idx no encontrado (puede ser normal si las tablas no existen aún)"
done

echo "🧪 Probando funciones básicas..."

# Probar función get_database_size
echo "  Probando get_database_size()..."
DB_SIZE=$(psql "$SUPABASE_URL" -c "SELECT get_database_size();" --quiet -t | tr -d ' ')
if [[ "$DB_SIZE" =~ ^[0-9]+\.?[0-9]*$ ]]; then
    echo "    ✅ get_database_size() funciona correctamente: ${DB_SIZE}MB"
else
    echo "    ❌ Error en get_database_size()"
    exit 1
fi

# Probar función sanitize_text
echo "  Probando sanitize_text()..."
SANITIZED=$(psql "$SUPABASE_URL" -c "SELECT sanitize_text('test<script>alert(1)</script>');" --quiet -t | tr -d ' ')
if [ "$SANITIZED" = "testalert(1)" ]; then
    echo "    ✅ sanitize_text() funciona correctamente"
else
    echo "    ❌ Error en sanitize_text(): resultado inesperado '$SANITIZED'"
    exit 1
fi

echo "🎯 Procedimientos almacenados aplicados exitosamente!"

echo ""
echo "📋 Resumen de funciones creadas:"
echo "  • get_conflict_stats() - Estadísticas de conflictos"
echo "  • get_database_size() - Tamaño de la BD"
echo "  • get_query_performance_stats() - Métricas de queries"
echo "  • cleanup_old_logs() - Limpieza automática"
echo "  • get_sync_stats() - Estadísticas de sincronización"
echo "  • get_active_users_stats() - Usuarios activos"
echo "  • get_orders_stats() - Estadísticas de órdenes"
echo "  • sanitize_text() - Sanitización de texto"
echo "  • log_suspicious_activity() - Logs de seguridad"
echo ""
echo "🔒 Sistema de protección SQL injection mejorado!"
echo "📊 Monitoreo y métricas disponibles"
echo "🧹 Limpieza automática configurada" 