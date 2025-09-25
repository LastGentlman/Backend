-- ===== CHECK RLS STATUS SCRIPT =====
-- Run this to check the current RLS status before applying fixes

-- Check if RLS is enabled on schema_cache table
SELECT 
    'RLS Status Check' as check_type,
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    CASE 
        WHEN rowsecurity THEN '✅ RLS is ENABLED'
        ELSE '❌ RLS is DISABLED - Security Warning!'
    END as status
FROM pg_tables 
WHERE tablename = 'schema_cache' 
AND schemaname = 'public';

-- Check if RLS policy exists
SELECT 
    'Policy Check' as check_type,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    CASE 
        WHEN policyname IS NOT NULL THEN '✅ Policy EXISTS'
        ELSE '❌ No Policy Found'
    END as status
FROM pg_policies 
WHERE tablename = 'schema_cache' 
AND schemaname = 'public';

-- Check table permissions
SELECT 
    'Permissions Check' as check_type,
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.table_privileges 
WHERE table_name = 'schema_cache' 
AND table_schema = 'public'
AND grantee = 'authenticated';

-- Summary
SELECT 
    'Summary' as check_type,
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
        ) THEN '✅ All Good - RLS is properly configured'
        ELSE '⚠️ Issues Found - Run the RLS fix migration'
    END as overall_status;
