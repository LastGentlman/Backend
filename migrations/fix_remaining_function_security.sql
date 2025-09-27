-- ===== MIGRACIÓN DE SEGURIDAD - FUNCIONES RESTANTES =====
-- Este script corrige las 12 funciones restantes con search_path mutable detectadas por el linter de Supabase
-- Ejecutar en Supabase SQL Editor

-- Primero eliminamos las funciones existentes con CASCADE para eliminar dependencias
DROP FUNCTION IF EXISTS delete_business_completely(UUID) CASCADE;
DROP FUNCTION IF EXISTS handle_business_deletion_trigger() CASCADE;
DROP FUNCTION IF EXISTS delete_user_from_dashboard(UUID) CASCADE;
DROP FUNCTION IF EXISTS preview_user_deletion(UUID) CASCADE;
DROP FUNCTION IF EXISTS process_account_deletion(UUID, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS delete_user_completely(UUID) CASCADE;
DROP FUNCTION IF EXISTS delete_user_and_auth(UUID) CASCADE;
DROP FUNCTION IF EXISTS handle_user_deletion_circular() CASCADE;
DROP FUNCTION IF EXISTS simple_delete_user(UUID) CASCADE;
DROP FUNCTION IF EXISTS handle_user_deletion_trigger() CASCADE;
DROP FUNCTION IF EXISTS benchmark_queries() CASCADE;

-- 1. Función delete_business_completely
CREATE OR REPLACE FUNCTION delete_business_completely(business_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  business_record RECORD;
  tables_cleaned TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Verify business exists
  SELECT * INTO business_record
  FROM businesses
  WHERE id = business_uuid;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Business not found',
      'business_id', business_uuid
    );
  END IF;
  
  -- Start transaction for complete cleanup
  BEGIN
    -- 1. Remove this business as "current" from any profiles
    UPDATE profiles 
    SET current_business_id = NULL 
    WHERE current_business_id = business_uuid;
    tables_cleaned := array_append(tables_cleaned, 'profiles (current_business_id)');
    
    -- 2. Delete business-related data in correct order
    
    -- Delete business invitation usage
    DELETE FROM business_invitation_usage 
    WHERE business_id = business_uuid;
    tables_cleaned := array_append(tables_cleaned, 'business_invitation_usage');
    
    -- Delete business invitation codes
    DELETE FROM business_invitation_codes 
    WHERE business_id = business_uuid;
    tables_cleaned := array_append(tables_cleaned, 'business_invitation_codes');
    
    -- Delete employees
    DELETE FROM employees 
    WHERE business_id = business_uuid;
    tables_cleaned := array_append(tables_cleaned, 'employees');
    
    -- Delete orders (anonymize customer data first)
    UPDATE orders 
    SET 
      customer_email = 'deleted@pedidolist.com',
      customer_name = 'Usuario Eliminado',
      customer_phone = NULL,
      updated_at = now()
    WHERE business_id = business_uuid;
    tables_cleaned := array_append(tables_cleaned, 'orders (anonymized)');
    
    -- Delete products
    DELETE FROM products 
    WHERE business_id = business_uuid;
    tables_cleaned := array_append(tables_cleaned, 'products');
    
    -- Delete categories
    DELETE FROM categories 
    WHERE business_id = business_uuid;
    tables_cleaned := array_append(tables_cleaned, 'categories');
    
    -- Delete business settings
    DELETE FROM business_settings 
    WHERE business_id = business_uuid;
    tables_cleaned := array_append(tables_cleaned, 'business_settings');
    
    -- Delete business analytics
    DELETE FROM business_analytics 
    WHERE business_id = business_uuid;
    tables_cleaned := array_append(tables_cleaned, 'business_analytics');
    
    -- 3. Delete the business itself
    DELETE FROM businesses 
    WHERE id = business_uuid;
    tables_cleaned := array_append(tables_cleaned, 'businesses');
    
    -- 4. Log successful deletion
    INSERT INTO audit_logs (action, user_id, details, created_at)
    VALUES (
      'BUSINESS_DELETION_COMPLETED',
      business_record.owner_id,
      jsonb_build_object(
        'business_id', business_uuid,
        'business_name', business_record.name,
        'tables_cleaned', to_jsonb(tables_cleaned),
        'deletion_method', 'immediate_complete'
      ),
      now()
    );
    
    RETURN json_build_object(
      'success', true,
      'business_id', business_uuid,
      'business_name', business_record.name,
      'tables_cleaned', tables_cleaned,
      'completed_at', now(),
      'deletion_method', 'immediate_complete'
    );
    
  EXCEPTION WHEN OTHERS THEN
    -- Log error
    INSERT INTO audit_logs (action, user_id, details, created_at)
    VALUES (
      'BUSINESS_DELETION_FAILED',
      business_record.owner_id,
      jsonb_build_object(
        'business_id', business_uuid,
        'error_message', SQLERRM,
        'error_code', SQLSTATE
      ),
      now()
    );
    
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE,
      'business_id', business_uuid
    );
  END;
END;
$$;

-- 2. Función handle_business_deletion_trigger
CREATE OR REPLACE FUNCTION handle_business_deletion_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Log business deletion
  INSERT INTO audit_logs (action, user_id, details, created_at)
  VALUES (
    'BUSINESS_DELETED',
    OLD.owner_id,
    jsonb_build_object(
      'business_id', OLD.id,
      'business_name', OLD.name,
      'deleted_at', now()
    ),
    now()
  );
  
  RETURN OLD;
END;
$$;

-- 3. Función delete_user_from_dashboard
CREATE OR REPLACE FUNCTION delete_user_from_dashboard(user_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  user_record RECORD;
  result JSON;
BEGIN
  -- Verify user exists
  SELECT * INTO user_record
  FROM auth.users
  WHERE id = user_uuid;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not found',
      'user_id', user_uuid
    );
  END IF;
  
  -- Call the main deletion function
  SELECT delete_user_completely(user_uuid) INTO result;
  
  RETURN result;
END;
$$;

-- 4. Función preview_user_deletion
CREATE OR REPLACE FUNCTION preview_user_deletion(user_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  user_record RECORD;
  business_count INTEGER;
  order_count INTEGER;
  product_count INTEGER;
  preview_data JSON;
BEGIN
  -- Get user info
  SELECT * INTO user_record
  FROM auth.users
  WHERE id = user_uuid;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not found',
      'user_id', user_uuid
    );
  END IF;
  
  -- Count related data
  SELECT COUNT(*) INTO business_count
  FROM businesses
  WHERE owner_id = user_uuid;
  
  SELECT COUNT(*) INTO order_count
  FROM orders o
  JOIN businesses b ON o.business_id = b.id
  WHERE b.owner_id = user_uuid;
  
  SELECT COUNT(*) INTO product_count
  FROM products p
  JOIN businesses b ON p.business_id = b.id
  WHERE b.owner_id = user_uuid;
  
  preview_data := json_build_object(
    'user_id', user_uuid,
    'user_email', user_record.email,
    'businesses_owned', business_count,
    'total_orders', order_count,
    'total_products', product_count,
    'deletion_impact', json_build_object(
      'businesses', business_count,
      'orders', order_count,
      'products', product_count
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'preview', preview_data
  );
END;
$$;

-- 5. Función process_account_deletion
CREATE OR REPLACE FUNCTION process_account_deletion(user_uuid UUID, immediate BOOLEAN DEFAULT false)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  user_record RECORD;
  result JSON;
BEGIN
  -- Verify user exists
  SELECT * INTO user_record
  FROM auth.users
  WHERE id = user_uuid;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not found',
      'user_id', user_uuid
    );
  END IF;
  
  IF immediate THEN
    -- Immediate deletion
    SELECT delete_user_completely(user_uuid) INTO result;
  ELSE
    -- Schedule for deletion (implement grace period logic here)
    INSERT INTO account_deletion_requests (user_id, requested_at, scheduled_for)
    VALUES (user_uuid, now(), now() + INTERVAL '7 days');
    
    result := json_build_object(
      'success', true,
      'message', 'Account deletion scheduled',
      'scheduled_for', now() + INTERVAL '7 days'
    );
  END IF;
  
  RETURN result;
END;
$$;

-- 6. Función delete_user_completely
CREATE OR REPLACE FUNCTION delete_user_completely(user_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  user_record RECORD;
  tables_cleaned TEXT[] := ARRAY[]::TEXT[];
  cleanup_result JSON;
BEGIN
  -- Verify user exists
  SELECT * INTO user_record
  FROM auth.users
  WHERE id = user_uuid;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not found',
      'user_id', user_uuid
    );
  END IF;
  
  -- Start transaction for complete cleanup
  BEGIN
    -- 1. Delete dependent data in correct order to avoid FK constraints
    
    -- Delete business invitation usage
    DELETE FROM business_invitation_usage WHERE used_by = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'business_invitation_usage');
    
    -- Delete business invitation codes created by user
    DELETE FROM business_invitation_codes WHERE created_by = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'business_invitation_codes');
    
    -- Delete push subscriptions
    DELETE FROM push_subscriptions WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'push_subscriptions');
    
    -- Delete notification logs
    DELETE FROM notification_logs WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'notification_logs');
    
    -- Delete error logs
    DELETE FROM error_logs WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'error_logs');
    
    -- Delete indexes
    DELETE FROM indexes WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'indexes');
    
    -- Delete conflict resolutions
    DELETE FROM conflict_resolutions WHERE resolved_by = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'conflict_resolutions');
    
    -- Delete sync queue entries
    DELETE FROM sync_queue WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'sync_queue');
    
    -- Delete user sessions
    DELETE FROM user_sessions WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'user_sessions');
    
    -- Delete user preferences
    DELETE FROM user_preferences WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'user_preferences');
    
    -- Delete employees (this will cascade to businesses if user is owner)
    DELETE FROM employees WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'employees');
    
    -- Delete profiles
    DELETE FROM profiles WHERE id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'profiles');
    
    -- 2. Log successful deletion
    INSERT INTO audit_logs (action, user_id, details, created_at)
    VALUES (
      'USER_DELETION_COMPLETED',
      user_uuid,
      jsonb_build_object(
        'user_id', user_uuid,
        'user_email', user_record.email,
        'tables_cleaned', to_jsonb(tables_cleaned),
        'deletion_method', 'immediate_complete'
      ),
      now()
    );
    
    cleanup_result := json_build_object(
      'success', true,
      'user_id', user_uuid,
      'user_email', user_record.email,
      'tables_cleaned', tables_cleaned,
      'completed_at', now(),
      'deletion_method', 'immediate_complete'
    );
    
  EXCEPTION WHEN OTHERS THEN
    -- Log error
    INSERT INTO audit_logs (action, user_id, details, created_at)
    VALUES (
      'USER_DELETION_FAILED',
      user_uuid,
      jsonb_build_object(
        'user_id', user_uuid,
        'error_message', SQLERRM,
        'error_code', SQLSTATE
      ),
      now()
    );
    
    cleanup_result := json_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE,
      'user_id', user_uuid
    );
  END;
  
  RETURN cleanup_result;
END;
$$;

-- 7. Función delete_user_and_auth
CREATE OR REPLACE FUNCTION delete_user_and_auth(user_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  result JSON;
BEGIN
  -- First delete from auth.users
  DELETE FROM auth.users WHERE id = user_uuid;
  
  -- Then call the main deletion function
  SELECT delete_user_completely(user_uuid) INTO result;
  
  RETURN result;
END;
$$;

-- 8. Función handle_user_deletion_circular
CREATE OR REPLACE FUNCTION handle_user_deletion_circular()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Log user deletion
  INSERT INTO audit_logs (action, user_id, details, created_at)
  VALUES (
    'USER_DELETED',
    OLD.id,
    jsonb_build_object(
      'user_id', OLD.id,
      'user_email', OLD.email,
      'deleted_at', now()
    ),
    now()
  );
  
  RETURN OLD;
END;
$$;

-- 9. Función simple_delete_user
CREATE OR REPLACE FUNCTION simple_delete_user(user_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  result JSON;
BEGIN
  -- Simple deletion - just call the main function
  SELECT delete_user_completely(user_uuid) INTO result;
  
  RETURN result;
END;
$$;

-- 10. Función handle_user_deletion_trigger
CREATE OR REPLACE FUNCTION handle_user_deletion_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Log user deletion trigger
  INSERT INTO audit_logs (action, user_id, details, created_at)
  VALUES (
    'USER_DELETION_TRIGGERED',
    OLD.id,
    jsonb_build_object(
      'user_id', OLD.id,
      'user_email', OLD.email,
      'triggered_at', now()
    ),
    now()
  );
  
  RETURN OLD;
END;
$$;

-- 11. Función benchmark_queries
CREATE OR REPLACE FUNCTION benchmark_queries()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  execution_time INTERVAL;
  results JSON;
BEGIN
  start_time := clock_timestamp();
  
  -- Run benchmark queries
  PERFORM COUNT(*) FROM businesses;
  PERFORM COUNT(*) FROM orders;
  PERFORM COUNT(*) FROM products;
  PERFORM COUNT(*) FROM employees;
  
  end_time := clock_timestamp();
  execution_time := end_time - start_time;
  
  results := json_build_object(
    'benchmark_completed', true,
    'execution_time_ms', EXTRACT(EPOCH FROM execution_time) * 1000,
    'timestamp', now()
  );
  
  RETURN results;
END;
$$;

-- Recrear triggers si es necesario
CREATE TRIGGER business_deletion_trigger
    AFTER DELETE ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION handle_business_deletion_trigger();

CREATE TRIGGER user_deletion_trigger
    AFTER DELETE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_user_deletion_trigger();

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
        'delete_business_completely', 'handle_business_deletion_trigger', 'delete_user_from_dashboard',
        'preview_user_deletion', 'process_account_deletion', 'delete_user_completely',
        'delete_user_and_auth', 'handle_user_deletion_circular', 'simple_delete_user',
        'handle_user_deletion_trigger', 'benchmark_queries'
    );
    
    RAISE NOTICE 'Total de funciones actualizadas: %', func_count;
    
    IF func_count = 11 THEN
        RAISE NOTICE '✅ Todas las funciones han sido actualizadas correctamente con SECURITY DEFINER SET search_path = ''''';
    ELSE
        RAISE WARNING '⚠️  Algunas funciones podrían no haberse actualizado correctamente. Esperadas: 11, Encontradas: %', func_count;
    END IF;
END;
$$;