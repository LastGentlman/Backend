-- ===== FIXES FOR PROFILES SCHEMA =====
-- Addresses mismatches between database schema and frontend expectations

-- 1. Rename 'name' field to 'fullName' to match frontend expectations
ALTER TABLE public.profiles RENAME COLUMN name TO fullName;

-- 2. Add missing fields that the frontend expects
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone character varying(20) null,
ADD COLUMN IF NOT EXISTS settings jsonb null default '{}';

-- 3. Create the correct trigger function for profiles (matching existing pattern)
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 4. Drop the old trigger and create the correct one
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profiles_updated_at();

-- 5. Add additional performance indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles USING btree (email) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles USING btree (phone) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_profiles_fullname ON public.profiles USING btree (fullName) TABLESPACE pg_default;

-- 6. Add composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_profiles_business_active ON public.profiles USING btree (current_business_id, is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles USING btree (created_at DESC) TABLESPACE pg_default;

-- 7. Add unique constraint on email (if not already exists)
-- Note: This might conflict with existing data, so we'll make it conditional
DO $$
BEGIN
    -- Only add unique constraint if no duplicates exist
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE email IS NOT NULL 
        GROUP BY email 
        HAVING COUNT(*) > 1
    ) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
    ELSE
        RAISE NOTICE 'Skipping unique email constraint due to existing duplicates';
    END IF;
END $$;

-- 8. Add check constraints for data validation
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_phone_format_check 
CHECK (phone IS NULL OR phone ~ '^[0-9]{7,20}$');

ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_email_format_check 
CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- 9. Add comments for documentation
COMMENT ON COLUMN public.profiles.fullName IS 'User full name (renamed from name for frontend compatibility)';
COMMENT ON COLUMN public.profiles.phone IS 'User phone number (7-20 digits)';
COMMENT ON COLUMN public.profiles.settings IS 'User preferences and settings (JSONB)';
COMMENT ON COLUMN public.profiles.current_business_id IS 'Currently active business for the user';
COMMENT ON COLUMN public.profiles.is_active IS 'Account status (true = active, false = inactive)';
COMMENT ON COLUMN public.profiles.deleted_at IS 'Soft delete timestamp (NULL = not deleted)';

-- 10. Update the settings default to match frontend expectations
UPDATE public.profiles 
SET settings = '{
  "notifications": true,
  "darkMode": false,
  "language": "es",
  "privacyMode": false
}'::jsonb
WHERE settings IS NULL OR settings = '{}'::jsonb;
