-- ===== MIGRACIÓN PARA PROCEDIMIENTOS ALMACENADOS =====
-- Ejecutar en Supabase SQL Editor

-- Función para obtener estadísticas de conflictos por negocio
CREATE OR REPLACE FUNCTION get_conflict_stats(business_uuid UUID)
RETURNS TABLE (
  total_conflicts BIGINT,
  local_wins BIGINT,
  server_wins BIGINT,
  merge_required BIGINT,
  avg_resolution_time INTERVAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_conflicts,
    COUNT(*) FILTER (WHERE resolution_type = 'local') as local_wins,
    COUNT(*) FILTER (WHERE resolution_type = 'server') as server_wins,
    COUNT(*) FILTER (WHERE resolution_type = 'merge') as merge_required,
    AVG(resolved_at - created_at) as avg_resolution_time
  FROM conflict_resolutions cr
  JOIN orders o ON cr.order_id = o.id
  WHERE o.business_id = business_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener el tamaño de la base de datos en MB
CREATE OR REPLACE FUNCTION get_database_size()
RETURNS NUMERIC AS $$
BEGIN
  RETURN (
    SELECT ROUND(pg_database_size(current_database()) / (1024.0 * 1024.0), 2)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener métricas de rendimiento de queries
CREATE OR REPLACE FUNCTION get_query_performance_stats()
RETURNS TABLE (
  avg_query_time NUMERIC,
  slow_queries_count BIGINT,
  total_queries BIGINT,
  error_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(AVG(execution_time), 0) as avg_query_time,
    COUNT(*) FILTER (WHERE execution_time > 1000) as slow_queries_count,
    COUNT(*) as total_queries,
    COALESCE(
      COUNT(*) FILTER (WHERE status = 'error')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 
      0
    ) as error_rate
  FROM query_logs 
  WHERE created_at >= NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para limpiar logs antiguos automáticamente
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void AS $$
BEGIN
  -- Limpiar logs de queries de más de 30 días
  DELETE FROM query_logs 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Limpiar logs de errores de más de 90 días
  DELETE FROM error_logs 
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Limpiar logs de WhatsApp de más de 90 días
  DELETE FROM whatsapp_logs 
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Limpiar alertas programadas ejecutadas de más de 30 días
  DELETE FROM scheduled_alerts 
  WHERE executed_at < NOW() - INTERVAL '30 days' 
  AND status IN ('executed', 'failed', 'cancelled');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener estadísticas de sincronización
CREATE OR REPLACE FUNCTION get_sync_stats(business_uuid UUID)
RETURNS TABLE (
  pending_syncs BIGINT,
  failed_syncs BIGINT,
  successful_syncs BIGINT,
  avg_sync_time NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE status = 'pending') as pending_syncs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_syncs,
    COUNT(*) FILTER (WHERE status = 'completed') as successful_syncs,
    COALESCE(AVG(execution_time), 0) as avg_sync_time
  FROM sync_queue sq
  JOIN orders o ON sq.entity_id = o.id::TEXT
  WHERE o.business_id = business_uuid
  AND sq.created_at >= NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener métricas de usuarios activos
CREATE OR REPLACE FUNCTION get_active_users_stats(business_uuid UUID)
RETURNS TABLE (
  total_users BIGINT,
  active_today BIGINT,
  active_this_week BIGINT,
  active_this_month BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT e.user_id) as total_users,
    COUNT(DISTINCT e.user_id) FILTER (WHERE us.last_activity >= NOW() - INTERVAL '1 day') as active_today,
    COUNT(DISTINCT e.user_id) FILTER (WHERE us.last_activity >= NOW() - INTERVAL '7 days') as active_this_week,
    COUNT(DISTINCT e.user_id) FILTER (WHERE us.last_activity >= NOW() - INTERVAL '30 days') as active_this_month
  FROM employees e
  LEFT JOIN user_sessions us ON e.user_id = us.user_id
  WHERE e.business_id = business_uuid
  AND e.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener estadísticas de órdenes por período
CREATE OR REPLACE FUNCTION get_orders_stats(
  business_uuid UUID,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  total_orders BIGINT,
  total_revenue NUMERIC,
  avg_order_value NUMERIC,
  orders_by_status JSONB
) AS $$
BEGIN
  -- Si no se proporcionan fechas, usar el último mes
  IF start_date IS NULL THEN
    start_date := CURRENT_DATE - INTERVAL '30 days';
  END IF;
  
  IF end_date IS NULL THEN
    end_date := CURRENT_DATE;
  END IF;
  
  RETURN QUERY
  SELECT 
    COUNT(*) as total_orders,
    COALESCE(SUM(total), 0) as total_revenue,
    COALESCE(AVG(total), 0) as avg_order_value,
    jsonb_object_agg(
      status, 
      COUNT(*) FILTER (WHERE status = status)
    ) as orders_by_status
  FROM orders
  WHERE business_id = business_uuid
  AND delivery_date BETWEEN start_date AND end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para validar y sanitizar entrada de texto
CREATE OR REPLACE FUNCTION sanitize_text(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Remover caracteres peligrosos para SQL injection
  RETURN regexp_replace(
    regexp_replace(
      regexp_replace(
        COALESCE(input_text, ''),
        '[<>"\''&;]', '', 'g'
      ),
      'javascript:', '', 'gi'
    ),
    'vbscript:', '', 'gi'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para registrar actividad sospechosa
CREATE OR REPLACE FUNCTION log_suspicious_activity(
  user_id UUID,
  activity_type TEXT,
  details JSONB,
  ip_address INET DEFAULT NULL,
  user_agent TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO security_logs (
    user_id,
    activity_type,
    details,
    ip_address,
    user_agent,
    created_at
  ) VALUES (
    user_id,
    activity_type,
    details,
    ip_address,
    user_agent,
    NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentarios para documentación
COMMENT ON FUNCTION get_conflict_stats(UUID) IS 'Obtiene estadísticas de conflictos de sincronización por negocio';
COMMENT ON FUNCTION get_database_size() IS 'Obtiene el tamaño de la base de datos en MB';
COMMENT ON FUNCTION get_query_performance_stats() IS 'Obtiene métricas de rendimiento de queries';
COMMENT ON FUNCTION cleanup_old_logs() IS 'Limpia logs antiguos automáticamente';
COMMENT ON FUNCTION get_sync_stats(UUID) IS 'Obtiene estadísticas de sincronización por negocio';
COMMENT ON FUNCTION get_active_users_stats(UUID) IS 'Obtiene estadísticas de usuarios activos por negocio';
COMMENT ON FUNCTION get_orders_stats(UUID, DATE, DATE) IS 'Obtiene estadísticas de órdenes por período';
COMMENT ON FUNCTION sanitize_text(TEXT) IS 'Sanitiza texto de entrada para prevenir SQL injection';
COMMENT ON FUNCTION log_suspicious_activity(UUID, TEXT, JSONB, INET, TEXT) IS 'Registra actividad sospechosa para monitoreo de seguridad';

-- Crear índices para optimizar las funciones
CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_order_id ON conflict_resolutions(order_id);
CREATE INDEX IF NOT EXISTS idx_query_logs_created_at ON query_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity);
CREATE INDEX IF NOT EXISTS idx_security_logs_created_at ON security_logs(created_at);

-- Programar limpieza automática de logs (ejecutar diariamente)
-- Nota: Esto requiere configuración de cron en Supabase
-- SELECT cron.schedule('cleanup-logs', '0 2 * * *', 'SELECT cleanup_old_logs();'); 