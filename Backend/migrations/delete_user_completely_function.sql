-- Migration: Complete User Deletion Function
-- This function provides immediate, complete user deletion without grace period
-- Use with caution - this is irreversible

CREATE OR REPLACE FUNCTION delete_user_completely(user_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
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
    
    -- Delete employees
    DELETE FROM employees WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'employees');
    
    -- 2. Update nullable foreign keys to NULL
    
    -- Update orders modified_by to NULL
    UPDATE orders SET modified_by = NULL WHERE modified_by = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'orders (modified_by)');
    
    -- Update businesses owner_id to NULL
    UPDATE businesses SET owner_id = NULL WHERE owner_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'businesses (owner_id)');
    
    -- 3. Delete user-specific data
    
    -- Delete user profiles
    DELETE FROM profiles WHERE id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'profiles');
    
    -- Delete user preferences
    DELETE FROM user_preferences WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'user_preferences');
    
    -- Delete user addresses
    DELETE FROM user_addresses WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'user_addresses');
    
    -- Delete user payment methods
    DELETE FROM user_payment_methods WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'user_payment_methods');
    
    -- Delete shopping carts
    DELETE FROM shopping_carts WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'shopping_carts');
    
    -- Delete favorite products
    DELETE FROM favorite_products WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'favorite_products');
    
    -- Delete product reviews
    DELETE FROM product_reviews WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'product_reviews');
    
    -- Delete shopping lists
    DELETE FROM shopping_lists WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'shopping_lists');
    
    -- Delete user notifications
    DELETE FROM user_notifications WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'user_notifications');
    
    -- Delete user messages
    DELETE FROM user_messages WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'user_messages');
    
    -- Delete support tickets
    DELETE FROM support_tickets WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'support_tickets');
    
    -- Delete user activity logs
    DELETE FROM user_activity_logs WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'user_activity_logs');
    
    -- Delete user sessions
    DELETE FROM user_sessions WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'user_sessions');
    
    -- Delete user analytics events
    DELETE FROM user_analytics_events WHERE user_id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'user_analytics_events');
    
    -- Cancel active subscriptions
    UPDATE user_subscriptions 
    SET 
      status = 'cancelled', 
      cancelled_at = now(),
      cancellation_reason = 'account_deleted'
    WHERE user_id = user_uuid AND status = 'active';
    tables_cleaned := array_append(tables_cleaned, 'user_subscriptions');
    
    -- 4. Delete from auth.users (this will cascade to related auth tables)
    DELETE FROM auth.users WHERE id = user_uuid;
    tables_cleaned := array_append(tables_cleaned, 'auth.users');
    
    -- 5. Log successful deletion
    INSERT INTO audit_logs (action, user_id, details, created_at)
    VALUES (
      'ACCOUNT_DELETION_COMPLETED_IMMEDIATE',
      user_uuid,
      jsonb_build_object(
        'tables_cleaned', to_jsonb(tables_cleaned),
        'user_email', user_record.email,
        'deletion_method', 'immediate_complete'
      ),
      now()
    );
    
    RETURN json_build_object(
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
      'ACCOUNT_DELETION_FAILED_IMMEDIATE',
      user_uuid,
      jsonb_build_object(
        'error_message', SQLERRM,
        'error_code', SQLSTATE,
        'user_email', user_record.email
      ),
      now()
    );
    
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE,
      'user_id', user_uuid
    );
  END;
END;
$$;

-- Function to delete business completely
CREATE OR REPLACE FUNCTION delete_business_completely(business_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
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
