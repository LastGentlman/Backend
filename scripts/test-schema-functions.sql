-- ===== TEST SCRIPT FOR SCHEMA FUNCTIONS =====
-- Run this in Supabase SQL Editor to test the functions

-- Test 1: Check if functions exist
SELECT 'Testing function existence...' as test;

SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
    'get_cached_schema_data',
    'set_cached_schema_data', 
    'get_batch_table_info',
    'get_batch_table_info_simple',
    'get_batch_table_info_pg',
    'get_foreign_keys_batch',
    'optimized_table_definition',
    'cleanup_schema_cache',
    'maintain_schema_cache',
    'get_performance_summary'
);

-- Test 2: Test cache functions
SELECT 'Testing cache functions...' as test;

-- Test setting cache data
SELECT set_cached_schema_data('test_key', '{"test": "data"}'::jsonb, 5);

-- Test getting cache data
SELECT get_cached_schema_data('test_key') as cached_data;

-- Test 3: Test batch table info functions
SELECT 'Testing batch table info functions...' as test;

-- Test with existing tables (adjust table names as needed)
SELECT * FROM get_batch_table_info(ARRAY['profiles']) LIMIT 3;

SELECT * FROM get_batch_table_info_simple(ARRAY['profiles']) LIMIT 3;

SELECT * FROM get_batch_table_info_pg(ARRAY['profiles']) LIMIT 3;

-- Test 4: Test foreign keys function
SELECT 'Testing foreign keys function...' as test;

SELECT * FROM get_foreign_keys_batch(ARRAY['profiles']) LIMIT 3;

-- Test 5: Test table definition function
SELECT 'Testing table definition function...' as test;

SELECT optimized_table_definition('profiles') as table_def;

-- Test 6: Test performance summary
SELECT 'Testing performance summary...' as test;

SELECT get_performance_summary() as performance_data;

-- Test 7: Test cleanup function
SELECT 'Testing cleanup function...' as test;

SELECT cleanup_schema_cache() as deleted_count;

-- Test 8: Test maintenance function
SELECT 'Testing maintenance function...' as test;

SELECT maintain_schema_cache();

-- Test 9: Check cache table
SELECT 'Checking cache table...' as test;

SELECT 
    cache_key,
    created_at,
    expires_at,
    access_count
FROM schema_cache 
ORDER BY created_at DESC 
LIMIT 5;

-- Test 10: Verify RLS is enabled
SELECT 'Verifying RLS is enabled...' as test;

SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'schema_cache' 
AND schemaname = 'public';

-- Test 11: Verify RLS policy exists
SELECT 'Verifying RLS policy exists...' as test;

SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies 
WHERE tablename = 'schema_cache' 
AND schemaname = 'public';

-- Test 12: Final verification
SELECT 'All tests completed successfully!' as result;
