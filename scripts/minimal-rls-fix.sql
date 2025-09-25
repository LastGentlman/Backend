-- ===== MINIMAL RLS FIX =====
-- This script only fixes what's actually needed

-- Step 1: Enable RLS if not already enabled
DO $$
BEGIN
    -- Check if RLS is already enabled
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = 'schema_cache' 
        AND schemaname = 'public' 
        AND rowsecurity = true
    ) THEN
        ALTER TABLE schema_cache ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'RLS enabled on schema_cache table';
    ELSE
        RAISE NOTICE 'RLS already enabled on schema_cache table';
    END IF;
END $$;

-- Step 2: Create policy if it doesn't exist
DO $$
BEGIN
    -- Check if policy already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'schema_cache' 
        AND schemaname = 'public'
        AND policyname = 'Authenticated users can access schema cache'
    ) THEN
        CREATE POLICY "Authenticated users can access schema cache" ON schema_cache
            FOR ALL USING (auth.role() = 'authenticated');
        RAISE NOTICE 'RLS policy created for schema_cache table';
    ELSE
        RAISE NOTICE 'RLS policy already exists for schema_cache table';
    END IF;
END $$;

-- Step 3: Verify the fix
SELECT 
    'Verification' as step,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE tablename = 'schema_cache' 
            AND schemaname = 'public' 
            AND rowsecurity = true
        ) AND EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'schema_cache' 
            AND schemaname = 'public'
        ) THEN '✅ RLS Fix Applied Successfully'
        ELSE '❌ RLS Fix Failed'
    END as result;
