-- Migration: Fix Deletion Functions to Handle Missing Tables
-- Updates deletion functions to gracefully handle tables that might not exist

-- Create a helper function to safely delete from tables
CREATE OR REPLACE FUNCTION safe_delete_from_table(table_name TEXT, user_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if table exists before attempting to delete
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = safe_delete_from_table.table_name
    ) THEN
        EXECUTE format('DELETE FROM %I WHERE user_id = $1', table_name) USING user_id_param;
        RETURN TRUE;
    ELSE
        -- Table doesn't exist, skip silently
        RETURN FALSE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the entire deletion process
    INSERT INTO audit_logs (action, user_id, details, created_at)
    VALUES (
        'DELETION_TABLE_ERROR',
        user_id_param,
        jsonb_build_object(
            'table_name', table_name,
            'error_message', SQLERRM,
            'error_code', SQLSTATE
        ),
        now()
    );
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- Drop existing functions first to avoid return type conflicts
DROP FUNCTION IF EXISTS delete_user_completely(UUID);
DROP FUNCTION IF EXISTS process_account_deletion(UUID);

-- Recreate the process_account_deletion function
CREATE OR REPLACE FUNCTION process_account_deletion(deletion_log_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deletion_record RECORD;
  cleanup_result JSON;
  tables_cleaned TEXT[] := ARRAY[]::TEXT[];
  tables_skipped TEXT[] := ARRAY[]::TEXT[];
  user_id_to_delete UUID;
  table_exists BOOLEAN;
BEGIN
  -- Get deletion record and verify grace period has expired
  SELECT * INTO deletion_record
  FROM account_deletion_logs
  WHERE id = deletion_log_id
    AND status = 'pending'
    AND grace_period_end <= now();
    
  IF NOT FOUND THEN
    RETURN json_build_object(
      'error', 'Deletion not found or grace period not expired',
      'deletion_id', deletion_log_id
    );
  END IF;
  
  user_id_to_delete := deletion_record.user_id;
  
  -- Start transaction for cleanup
  BEGIN
    -- 1. Anonymize orders (keep for business records but remove personal data)
    UPDATE orders 
    SET 
      customer_email = 'deleted@pedidolist.com',
      customer_name = 'Usuario Eliminado',
      customer_phone = NULL,
      updated_at = now()
    WHERE user_id = user_id_to_delete;
    
    tables_cleaned := array_append(tables_cleaned, 'orders');
    
    -- 2. Delete user-specific data using safe deletion
    -- User profiles
    SELECT safe_delete_from_table('user_profiles', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'user_profiles');
    ELSE
      tables_skipped := array_append(tables_skipped, 'user_profiles');
    END IF;
    
    -- User preferences
    SELECT safe_delete_from_table('user_preferences', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'user_preferences');
    ELSE
      tables_skipped := array_append(tables_skipped, 'user_preferences');
    END IF;
    
    -- User addresses
    SELECT safe_delete_from_table('user_addresses', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'user_addresses');
    ELSE
      tables_skipped := array_append(tables_skipped, 'user_addresses');
    END IF;
    
    -- User payment methods
    SELECT safe_delete_from_table('user_payment_methods', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'user_payment_methods');
    ELSE
      tables_skipped := array_append(tables_skipped, 'user_payment_methods');
    END IF;
    
    -- Shopping carts
    SELECT safe_delete_from_table('shopping_carts', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'shopping_carts');
    ELSE
      tables_skipped := array_append(tables_skipped, 'shopping_carts');
    END IF;
    
    -- Favorite products
    SELECT safe_delete_from_table('favorite_products', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'favorite_products');
    ELSE
      tables_skipped := array_append(tables_skipped, 'favorite_products');
    END IF;
    
    -- Product reviews
    SELECT safe_delete_from_table('product_reviews', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'product_reviews');
    ELSE
      tables_skipped := array_append(tables_skipped, 'product_reviews');
    END IF;
    
    -- Shopping lists
    SELECT safe_delete_from_table('shopping_lists', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'shopping_lists');
    ELSE
      tables_skipped := array_append(tables_skipped, 'shopping_lists');
    END IF;
    
    -- User notifications
    SELECT safe_delete_from_table('user_notifications', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'user_notifications');
    ELSE
      tables_skipped := array_append(tables_skipped, 'user_notifications');
    END IF;
    
    -- User messages
    SELECT safe_delete_from_table('user_messages', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'user_messages');
    ELSE
      tables_skipped := array_append(tables_skipped, 'user_messages');
    END IF;
    
    -- Support tickets
    SELECT safe_delete_from_table('support_tickets', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'support_tickets');
    ELSE
      tables_skipped := array_append(tables_skipped, 'support_tickets');
    END IF;
    
    -- User activity logs
    SELECT safe_delete_from_table('user_activity_logs', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'user_activity_logs');
    ELSE
      tables_skipped := array_append(tables_skipped, 'user_activity_logs');
    END IF;
    
    -- User sessions
    SELECT safe_delete_from_table('user_sessions', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'user_sessions');
    ELSE
      tables_skipped := array_append(tables_skipped, 'user_sessions');
    END IF;
    
    -- User analytics events
    SELECT safe_delete_from_table('user_analytics_events', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'user_analytics_events');
    ELSE
      tables_skipped := array_append(tables_skipped, 'user_analytics_events');
    END IF;
    
    -- User subscriptions
    SELECT safe_delete_from_table('user_subscriptions', user_id_to_delete) INTO table_exists;
    IF table_exists THEN
      tables_cleaned := array_append(tables_cleaned, 'user_subscriptions');
    ELSE
      tables_skipped := array_append(tables_skipped, 'user_subscriptions');
    END IF;
    
    -- 3. Handle business-related data
    -- If user is business owner, transfer ownership or mark business as inactive
    UPDATE businesses 
    SET 
      owner_id = NULL,
      status = 'inactive',
      updated_at = now()
    WHERE owner_id = user_id_to_delete;
    
    -- Remove user from employees table
    DELETE FROM employees WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'employees');
    
    -- 4. Cancel active subscriptions (if table exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_subscriptions') THEN
      UPDATE user_subscriptions 
      SET 
        status = 'cancelled', 
        cancelled_at = now(),
        cancellation_reason = 'account_deleted'
      WHERE user_id = user_id_to_delete AND status = 'active';
    END IF;
    
    -- 5. Delete from auth.users (this will cascade to related auth tables)
    DELETE FROM auth.users WHERE id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'auth.users');
    
    -- 6. Update deletion log status
    UPDATE account_deletion_logs
    SET 
      status = 'completed', 
      completed_at = now(),
      cleanup_details = jsonb_build_object(
        'tables_cleaned', to_jsonb(tables_cleaned),
        'tables_skipped', to_jsonb(tables_skipped),
        'cleanup_timestamp', now()
      )
    WHERE id = deletion_log_id;
    
    -- 7. Log successful deletion
    INSERT INTO audit_logs (action, user_id, details, created_at)
    VALUES (
      'ACCOUNT_DELETION_COMPLETED',
      user_id_to_delete,
      jsonb_build_object(
        'deletion_log_id', deletion_log_id,
        'tables_cleaned', to_jsonb(tables_cleaned),
        'tables_skipped', to_jsonb(tables_skipped),
        'user_email', deletion_record.user_email
      ),
      now()
    );
    
    RETURN json_build_object(
      'success', true,
      'user_id', user_id_to_delete,
      'deletion_log_id', deletion_log_id,
      'tables_cleaned', tables_cleaned,
      'tables_skipped', tables_skipped,
      'completed_at', now()
    );
    
  EXCEPTION WHEN OTHERS THEN
    -- Log error and update deletion log
    UPDATE account_deletion_logs
    SET 
      status = 'failed',
      error_details = jsonb_build_object(
        'error_message', SQLERRM,
        'error_code', SQLSTATE,
        'failed_at', now()
      )
    WHERE id = deletion_log_id;
    
    -- Log error in audit
    INSERT INTO audit_logs (action, user_id, details, created_at)
    VALUES (
      'ACCOUNT_DELETION_FAILED',
      user_id_to_delete,
      jsonb_build_object(
        'deletion_log_id', deletion_log_id,
        'error_message', SQLERRM,
        'error_code', SQLSTATE
      ),
      now()
    );
    
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE,
      'deletion_log_id', deletion_log_id
    );
  END;
END;
$$;

-- Also update the other deletion function for consistency
CREATE OR REPLACE FUNCTION delete_user_completely(user_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tables_cleaned TEXT[] := ARRAY[]::TEXT[];
  tables_skipped TEXT[] := ARRAY[]::TEXT[];
  table_exists BOOLEAN;
BEGIN
  -- Use safe deletion for all user tables
  -- User profiles
  SELECT safe_delete_from_table('user_profiles', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'user_profiles');
  ELSE
    tables_skipped := array_append(tables_skipped, 'user_profiles');
  END IF;
  
  -- User preferences
  SELECT safe_delete_from_table('user_preferences', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'user_preferences');
  ELSE
    tables_skipped := array_append(tables_skipped, 'user_preferences');
  END IF;
  
  -- User addresses
  SELECT safe_delete_from_table('user_addresses', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'user_addresses');
  ELSE
    tables_skipped := array_append(tables_skipped, 'user_addresses');
  END IF;
  
  -- User payment methods
  SELECT safe_delete_from_table('user_payment_methods', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'user_payment_methods');
  ELSE
    tables_skipped := array_append(tables_skipped, 'user_payment_methods');
  END IF;
  
  -- Shopping carts
  SELECT safe_delete_from_table('shopping_carts', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'shopping_carts');
  ELSE
    tables_skipped := array_append(tables_skipped, 'shopping_carts');
  END IF;
  
  -- Favorite products
  SELECT safe_delete_from_table('favorite_products', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'favorite_products');
  ELSE
    tables_skipped := array_append(tables_skipped, 'favorite_products');
  END IF;
  
  -- Product reviews
  SELECT safe_delete_from_table('product_reviews', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'product_reviews');
  ELSE
    tables_skipped := array_append(tables_skipped, 'product_reviews');
  END IF;
  
  -- Shopping lists
  SELECT safe_delete_from_table('shopping_lists', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'shopping_lists');
  ELSE
    tables_skipped := array_append(tables_skipped, 'shopping_lists');
  END IF;
  
  -- User notifications
  SELECT safe_delete_from_table('user_notifications', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'user_notifications');
  ELSE
    tables_skipped := array_append(tables_skipped, 'user_notifications');
  END IF;
  
  -- User messages
  SELECT safe_delete_from_table('user_messages', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'user_messages');
  ELSE
    tables_skipped := array_append(tables_skipped, 'user_messages');
  END IF;
  
  -- Support tickets
  SELECT safe_delete_from_table('support_tickets', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'support_tickets');
  ELSE
    tables_skipped := array_append(tables_skipped, 'support_tickets');
  END IF;
  
  -- User activity logs
  SELECT safe_delete_from_table('user_activity_logs', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'user_activity_logs');
  ELSE
    tables_skipped := array_append(tables_skipped, 'user_activity_logs');
  END IF;
  
  -- User sessions
  SELECT safe_delete_from_table('user_sessions', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'user_sessions');
  ELSE
    tables_skipped := array_append(tables_skipped, 'user_sessions');
  END IF;
  
  -- User analytics events
  SELECT safe_delete_from_table('user_analytics_events', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'user_analytics_events');
  ELSE
    tables_skipped := array_append(tables_skipped, 'user_analytics_events');
  END IF;
  
  -- User subscriptions
  SELECT safe_delete_from_table('user_subscriptions', user_uuid) INTO table_exists;
  IF table_exists THEN
    tables_cleaned := array_append(tables_cleaned, 'user_subscriptions');
  ELSE
    tables_skipped := array_append(tables_skipped, 'user_subscriptions');
  END IF;
  
  -- Remove from employees
  DELETE FROM employees WHERE user_id = user_uuid;
  tables_cleaned := array_append(tables_cleaned, 'employees');
  
  -- Delete from auth.users
  DELETE FROM auth.users WHERE id = user_uuid;
  tables_cleaned := array_append(tables_cleaned, 'auth.users');
  
  RETURN json_build_object(
    'success', true,
    'user_id', user_uuid,
    'tables_cleaned', tables_cleaned,
    'tables_skipped', tables_skipped,
    'completed_at', now()
  );
END;
$$;
