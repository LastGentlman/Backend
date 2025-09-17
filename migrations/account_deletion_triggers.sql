-- Migration: Account Deletion Triggers and Functions
-- This implements proper account deletion with grace period and automatic cleanup

-- Function to handle account deletion request (soft delete with grace period)
CREATE OR REPLACE FUNCTION handle_account_deletion_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark user as deleted in auth.users metadata (soft delete)
  UPDATE auth.users 
  SET 
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
                         jsonb_build_object(
                           'account_deleted', true, 
                           'deleted_at', now()::text,
                           'deletion_log_id', NEW.id::text
                         ),
    updated_at = now()
  WHERE id = NEW.user_id;
  
  -- Invalidate all active sessions for this user
  DELETE FROM auth.sessions WHERE user_id = NEW.user_id;
  
  -- Log audit trail
  INSERT INTO audit_logs (action, user_id, details, created_at)
  VALUES (
    'ACCOUNT_DELETION_INITIATED',
    NEW.user_id,
    jsonb_build_object(
      'deletion_log_id', NEW.id,
      'reason', NEW.deletion_reason,
      'grace_period_end', NEW.grace_period_end,
      'user_email', NEW.user_email
    ),
    now()
  );
  
  RETURN NEW;
END;
$$;

-- Create the trigger for account deletion requests
DROP TRIGGER IF EXISTS trigger_handle_account_deletion ON account_deletion_logs;
CREATE TRIGGER trigger_handle_account_deletion
  AFTER INSERT ON account_deletion_logs
  FOR EACH ROW
  EXECUTE FUNCTION handle_account_deletion_request();

-- Function to process account deletion after grace period expires
CREATE OR REPLACE FUNCTION process_account_deletion(deletion_log_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deletion_record RECORD;
  cleanup_result JSON;
  tables_cleaned TEXT[] := ARRAY[]::TEXT[];
  user_id_to_delete UUID;
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
    
    -- 2. Delete user-specific data
    DELETE FROM user_profiles WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_profiles');
    
    DELETE FROM user_preferences WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_preferences');
    
    DELETE FROM user_addresses WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_addresses');
    
    DELETE FROM user_payment_methods WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_payment_methods');
    
    DELETE FROM shopping_carts WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'shopping_carts');
    
    DELETE FROM favorite_products WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'favorite_products');
    
    DELETE FROM product_reviews WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'product_reviews');
    
    DELETE FROM shopping_lists WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'shopping_lists');
    
    DELETE FROM user_notifications WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_notifications');
    
    DELETE FROM user_messages WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_messages');
    
    DELETE FROM support_tickets WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'support_tickets');
    
    DELETE FROM user_activity_logs WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_activity_logs');
    
    DELETE FROM user_sessions WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_sessions');
    
    DELETE FROM user_analytics_events WHERE user_id = user_id_to_delete;
    tables_cleaned := array_append(tables_cleaned, 'user_analytics_events');
    
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
    
    -- 4. Cancel active subscriptions
    UPDATE user_subscriptions 
    SET 
      status = 'cancelled', 
      cancelled_at = now(),
      cancellation_reason = 'account_deleted'
    WHERE user_id = user_id_to_delete AND status = 'active';
    
    tables_cleaned := array_append(tables_cleaned, 'user_subscriptions');
    
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
        'user_email', deletion_record.user_email
      ),
      now()
    );
    
    RETURN json_build_object(
      'success', true,
      'user_id', user_id_to_delete,
      'deletion_log_id', deletion_log_id,
      'tables_cleaned', tables_cleaned,
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

-- Function to cancel account deletion (restore account)
CREATE OR REPLACE FUNCTION cancel_account_deletion(deletion_log_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deletion_record RECORD;
  user_id_to_restore UUID;
BEGIN
  -- Get deletion record
  SELECT * INTO deletion_record
  FROM account_deletion_logs
  WHERE id = deletion_log_id
    AND status = 'pending';
    
  IF NOT FOUND THEN
    RETURN json_build_object(
      'error', 'Deletion record not found or already processed',
      'deletion_id', deletion_log_id
    );
  END IF;
  
  user_id_to_restore := deletion_record.user_id;
  
  -- Restore user metadata
  UPDATE auth.users 
  SET 
    raw_user_meta_data = raw_user_meta_data - 'account_deleted' - 'deleted_at' - 'deletion_log_id',
    updated_at = now()
  WHERE id = user_id_to_restore;
  
  -- Update deletion log status
  UPDATE account_deletion_logs
  SET 
    status = 'cancelled',
    cancelled_at = now()
  WHERE id = deletion_log_id;
  
  -- Log restoration
  INSERT INTO audit_logs (action, user_id, details, created_at)
  VALUES (
    'ACCOUNT_DELETION_CANCELLED',
    user_id_to_restore,
    jsonb_build_object(
      'deletion_log_id', deletion_log_id,
      'user_email', deletion_record.user_email,
      'cancelled_at', now()
    ),
    now()
  );
  
  RETURN json_build_object(
    'success', true,
    'user_id', user_id_to_restore,
    'deletion_log_id', deletion_log_id,
    'cancelled_at', now()
  );
END;
$$;

-- Function to get accounts ready for deletion (for scheduled cleanup)
CREATE OR REPLACE FUNCTION get_accounts_ready_for_deletion()
RETURNS TABLE (
  deletion_log_id UUID,
  user_id UUID,
  user_email TEXT,
  grace_period_end TIMESTAMP WITH TIME ZONE,
  days_overdue INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    adl.id,
    adl.user_id,
    adl.user_email,
    adl.grace_period_end,
    EXTRACT(DAY FROM (now() - adl.grace_period_end))::INTEGER as days_overdue
  FROM account_deletion_logs adl
  WHERE adl.status = 'pending'
    AND adl.grace_period_end <= now()
  ORDER BY adl.grace_period_end ASC;
END;
$$;

-- Add missing columns to account_deletion_logs if they don't exist
DO $$ 
BEGIN
  -- Add status column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'account_deletion_logs' AND column_name = 'status') THEN
    ALTER TABLE account_deletion_logs ADD COLUMN status TEXT DEFAULT 'pending';
  END IF;
  
  -- Add completed_at column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'account_deletion_logs' AND column_name = 'completed_at') THEN
    ALTER TABLE account_deletion_logs ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Add cancelled_at column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'account_deletion_logs' AND column_name = 'cancelled_at') THEN
    ALTER TABLE account_deletion_logs ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Add cleanup_details column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'account_deletion_logs' AND column_name = 'cleanup_details') THEN
    ALTER TABLE account_deletion_logs ADD COLUMN cleanup_details JSONB;
  END IF;
  
  -- Add error_details column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'account_deletion_logs' AND column_name = 'error_details') THEN
    ALTER TABLE account_deletion_logs ADD COLUMN error_details JSONB;
  END IF;
END $$;

-- Create audit_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    user_id UUID,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on audit_logs for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy for audit_logs (system only)
CREATE POLICY "system_only_audit_logs" ON audit_logs
    FOR ALL
    USING (false); -- Only system functions can access audit logs
