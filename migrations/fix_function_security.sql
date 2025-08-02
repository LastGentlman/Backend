-- ===== MIGRACIÓN DE SEGURIDAD - SOLUCIÓN SEARCH_PATH =====
-- Este script corrige las funciones con search_path mutable detectadas por el linter de Supabase
-- Ejecutar en Supabase SQL Editor

-- 1. Función update_client_stats (clients_schema.sql)
CREATE OR REPLACE FUNCTION update_client_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Actualizar total_orders y total_spent del cliente
  UPDATE clients 
  SET 
    total_orders = (
      SELECT COUNT(*) 
      FROM orders 
      WHERE client_name = clients.name 
      AND business_id = clients.business_id
    ),
    total_spent = (
      SELECT COALESCE(SUM(total), 0) 
      FROM orders 
      WHERE client_name = clients.name 
      AND business_id = clients.business_id
    ),
    last_order_date = (
      SELECT MAX(delivery_date) 
      FROM orders 
      WHERE client_name = clients.name 
      AND business_id = clients.business_id
    ),
    updated_at = NOW()
  WHERE business_id = NEW.business_id 
  AND name = NEW.client_name;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 2. Función update_clients_updated_at (clients_schema.sql)
CREATE OR REPLACE FUNCTION update_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 3. Función update_updated_at_column (whatsapp_integration.sql)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 4. Función update_last_modified (main_schema.sql)
CREATE OR REPLACE FUNCTION update_last_modified()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_modified_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 5. Función cleanup_old_offline_data (main_schema.sql)
CREATE OR REPLACE FUNCTION cleanup_old_offline_data()
RETURNS void AS $$
BEGIN
  -- Limpiar pedidos de más de 30 días
  DELETE FROM orders 
  WHERE delivery_date < CURRENT_DATE - INTERVAL '30 days'
  AND status IN ('completed', 'cancelled');
  
  -- Limpiar cola de sincronización de más de 7 días
  DELETE FROM sync_queue 
  WHERE created_at < NOW() - INTERVAL '7 days'
  AND status IN ('completed', 'failed');
  
  -- Limpiar resoluciones de conflictos de más de 30 días
  DELETE FROM conflict_resolutions 
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 6. Función get_conflict_stats (stored_procedures.sql)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 7. Función get_database_size (stored_procedures.sql)
CREATE OR REPLACE FUNCTION get_database_size()
RETURNS NUMERIC AS $$
BEGIN
  RETURN (
    SELECT ROUND(pg_database_size(current_database()) / (1024.0 * 1024.0), 2)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 8. Función get_query_performance_stats (stored_procedures.sql)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 9. Función cleanup_old_logs (stored_procedures.sql)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 10. Función get_sync_stats (stored_procedures.sql)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 11. Función get_active_users_stats (stored_procedures.sql)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 12. Función get_orders_stats (stored_procedures.sql)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 13. Función sanitize_text (stored_procedures.sql)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 14. Función log_suspicious_activity (stored_procedures.sql)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Confirmar que las funciones se han actualizado correctamente
DO $$
DECLARE
    func_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO func_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN (
        'update_client_stats', 'update_clients_updated_at', 'update_updated_at_column',
        'update_last_modified', 'cleanup_old_offline_data', 'get_conflict_stats',
        'get_database_size', 'get_query_performance_stats', 'cleanup_old_logs',
        'get_sync_stats', 'get_active_users_stats', 'get_orders_stats',
        'sanitize_text', 'log_suspicious_activity'
    );
    
    RAISE NOTICE 'Total de funciones actualizadas: %', func_count;
    
    IF func_count = 14 THEN
        RAISE NOTICE '✅ Todas las funciones han sido actualizadas correctamente con SECURITY DEFINER SET search_path = ''''';
    ELSE
        RAISE WARNING '⚠️  Algunas funciones podrían no haberse actualizado correctamente. Esperadas: 14, Encontradas: %', func_count;
    END IF;
END;
$$; 