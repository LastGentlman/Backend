-- Fix OAuth Account Deletion Issue
-- This migration updates the account deletion triggers to properly handle OAuth users
-- by updating both raw_user_meta_data AND user_metadata fields

-- Recreate the handle_account_deletion_request function with OAuth fix
CREATE OR REPLACE FUNCTION handle_account_deletion_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark user as deleted in auth.users metadata (soft delete)
  -- Update both raw_user_meta_data AND user_metadata for OAuth compatibility
  UPDATE auth.users
  SET
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) ||
                         jsonb_build_object(
                           'account_deleted', true,
                           'deleted_at', now()::text,
                           'deletion_log_id', NEW.id::text
                         ),
    user_metadata = COALESCE(user_metadata, '{}'::jsonb) ||
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

-- Recreate the cancel_account_deletion function with OAuth fix
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
  -- Remove deletion flags from both raw_user_meta_data AND user_metadata for OAuth compatibility
  UPDATE auth.users
  SET
    raw_user_meta_data = raw_user_meta_data - 'account_deleted' - 'deleted_at' - 'deletion_log_id',
    user_metadata = user_metadata - 'account_deleted' - 'deleted_at' - 'deletion_log_id',
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