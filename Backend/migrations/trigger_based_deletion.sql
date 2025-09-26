-- Migration: Trigger-Based Account Deletion
-- This implements automatic cleanup when users are deleted from auth.users
-- This is the simplest approach - just delete from auth.users and let triggers handle the rest

-- Function to handle automatic cleanup when user is deleted from auth.users
CREATE OR REPLACE FUNCTION handle_user_deletion_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id_to_delete UUID;
  tables_cleaned TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Get the user ID that was deleted
  user_id_to_delete := OLD.id;
  
  -- Log the deletion attempt
  INSERT INTO audit_logs (action, user_id, details, created_at)
  VALUES (
    'USER_DELETION_TRIGGER_INITIATED',
    user_id_to_delete,
    jsonb_build_object(
      'user_email', OLD.email,
      'deletion_method', 'trigger_based',
      'triggered_at', now()
    ),
    now()
  );
  
  -- Start cleanup process
  BEGIN
    -- 1. Delete dependent data in correct order to avoid FK constraints
    
    -- Delete business invitation usage
    DELETE FROM business_invitation_usage WHERE used_by = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'business_invitation_usage');
    
    -- Delete business invitation codes created by user
    DELETE FROM business_invitation_codes WHERE created_by = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'business_invitation_codes');
    
    -- Delete push subscriptions
    DELETE FROM push_subscriptions WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'push_subscriptions');
    
    -- Delete notification logs
    DELETE FROM notification_logs WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'notification_logs');
    
    -- Delete error logs
    DELETE FROM error_logs WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'error_logs');
    
    -- Delete backup metadata
    DELETE FROM backup_metadata WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'backup_metadata');
    
    -- Delete indexes
    DELETE FROM indexes WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'indexes');
    
    -- Delete conflict resolutions
    DELETE FROM conflict_resolutions WHERE resolved_by = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'conflict_resolutions');
    
    -- Delete employees
    DELETE FROM employees WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'employees');
    
    -- 2. Update nullable foreign keys to NULL
    
    -- Update orders modified_by to NULL
    UPDATE orders SET modified_by = NULL WHERE modified_by = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'orders (modified_by)');
    
    -- Update businesses owner_id to NULL
    UPDATE businesses SET owner_id = NULL WHERE owner_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'businesses (owner_id)');
    
    -- 3. Delete user-specific data
    
    -- Delete user profiles
    DELETE FROM profiles WHERE id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'profiles');
    
    -- Delete user preferences
    DELETE FROM user_preferences WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_preferences');
    
    -- Delete user addresses
    DELETE FROM user_addresses WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_addresses');
    
    -- Delete user payment methods
    DELETE FROM user_payment_methods WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_payment_methods');
    
    -- Delete shopping carts
    DELETE FROM shopping_carts WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'shopping_carts');
    
    -- Delete favorite products
    DELETE FROM favorite_products WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'favorite_products');
    
    -- Delete product reviews
    DELETE FROM product_reviews WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'product_reviews');
    
    -- Delete shopping lists
    DELETE FROM shopping_lists WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'shopping_lists');
    
    -- Delete user notifications
    DELETE FROM user_notifications WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_notifications');
    
    -- Delete user messages
    DELETE FROM user_messages WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_messages');
    
    -- Delete support tickets
    DELETE FROM support_tickets WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'support_tickets');
    
    -- Delete user activity logs
    DELETE FROM user_activity_logs WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_activity_logs');
    
    -- Delete user sessions
    DELETE FROM user_sessions WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_sessions');
    
    -- Delete user analytics events
    DELETE FROM user_analytics_events WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_analytics_events');
    
    -- Cancel active subscriptions
    UPDATE user_subscriptions 
    SET 
      status = 'cancelled', 
      cancelled_at = now(),
      cancellation_reason = 'account_deleted_trigger'
    WHERE user_id = user_id_to_delete AND status = 'active';
    tables_cleaned := array_append(tables_cleaned, 'user_subscriptions');
    
    -- Log successful cleanup
    INSERT INTO audit_logs (action, user_id, details, created_at)
    VALUES (
      'USER_DELETION_TRIGGER_COMPLETED',
      user_id_to_delete,
      jsonb_build_object(
        'tables_cleaned', to_jsonb(tables_cleaned),
        'user_email', OLD.email,
        'deletion_method', 'trigger_based',
        'cleanup_timestamp', now()
      ),
      now()
    );
    
  EXCEPTION WHEN OTHERS THEN
    -- Log error
    INSERT INTO audit_logs (action, user_id, details, created_at)
    VALUES (
      'USER_DELETION_TRIGGER_FAILED',
      user_id_to_delete,
      jsonb_build_object(
        'error_message', SQLERRM,
        'error_code', SQLSTATE,
        'user_email', OLD.email,
        'deletion_method', 'trigger_based'
      ),
      now()
    );
    
    -- Re-raise the exception to prevent the deletion if cleanup fails
    RAISE;
  END;
  
  RETURN OLD;
END;
$$;

-- Create the trigger for automatic cleanup
DROP TRIGGER IF EXISTS trigger_handle_user_deletion ON auth.users;
CREATE TRIGGER trigger_handle_user_deletion
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_user_deletion_trigger();

-- Function to handle business deletion trigger
CREATE OR REPLACE FUNCTION handle_business_deletion_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  business_id_to_delete UUID;
  tables_cleaned TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Get the business ID that was deleted
  business_id_to_delete := OLD.id;
  
  -- Log the deletion attempt
  INSERT INTO audit_logs (action, user_id, details, created_at)
  VALUES (
    'BUSINESS_DELETION_TRIGGER_INITIATED',
    OLD.owner_id,
    jsonb_build_object(
      'business_id', business_id_to_delete,
      'business_name', OLD.name,
      'deletion_method', 'trigger_based',
      'triggered_at', now()
    ),
    now()
  );
  
  -- Start cleanup process
  BEGIN
    -- 1. Remove this business as "current" from any profiles
    UPDATE profiles 
    SET current_business_id = NULL 
    WHERE current_business_id = business_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'profiles (current_business_id)');
    
    -- 2. Delete business-related data in correct order
    
    -- Delete business invitation usage
    DELETE FROM business_invitation_usage 
    WHERE business_id = business_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'business_invitation_usage');
    
    -- Delete business invitation codes
    DELETE FROM business_invitation_codes 
    WHERE business_id = business_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'business_invitation_codes');
    
    -- Delete employees
    DELETE FROM employees 
    WHERE business_id = business_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'employees');
    
    -- Anonymize orders (keep for business records but remove personal data)
    UPDATE orders 
    SET 
      customer_email = 'deleted@pedidolist.com',
      customer_name = 'Usuario Eliminado',
      customer_phone = NULL,
      updated_at = now()
    WHERE business_id = business_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'orders (anonymized)');
    
    -- Delete products
    DELETE FROM products 
    WHERE business_id = business_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'products');
    
    -- Delete categories
    DELETE FROM categories 
    WHERE business_id = business_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'categories');
    
    -- Delete business settings
    DELETE FROM business_settings 
    WHERE business_id = business_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'business_settings');
    
    -- Delete business analytics
    DELETE FROM business_analytics 
    WHERE business_id = business_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'business_analytics');
    
    -- Log successful cleanup
    INSERT INTO audit_logs (action, user_id, details, created_at)
    VALUES (
      'BUSINESS_DELETION_TRIGGER_COMPLETED',
      OLD.owner_id,
      jsonb_build_object(
        'business_id', business_id_to_delete,
        'business_name', OLD.name,
        'tables_cleaned', to_jsonb(tables_cleaned),
        'deletion_method', 'trigger_based',
        'cleanup_timestamp', now()
      ),
      now()
    );
    
  EXCEPTION WHEN OTHERS THEN
    -- Log error
    INSERT INTO audit_logs (action, user_id, details, created_at)
    VALUES (
      'BUSINESS_DELETION_TRIGGER_FAILED',
      OLD.owner_id,
      jsonb_build_object(
        'business_id', business_id_to_delete,
        'error_message', SQLERRM,
        'error_code', SQLSTATE,
        'deletion_method', 'trigger_based'
      ),
      now()
    );
    
    -- Re-raise the exception to prevent the deletion if cleanup fails
    RAISE;
  END;
  
  RETURN OLD;
END;
$$;

-- Create the trigger for automatic business cleanup
DROP TRIGGER IF EXISTS trigger_handle_business_deletion ON businesses;
CREATE TRIGGER trigger_handle_business_deletion
  BEFORE DELETE ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION handle_business_deletion_trigger();
