-- Test script to verify RLS policy behavior after performance optimizations
-- Run this after applying the migration to ensure security is maintained

-- Test 1: Verify that users can only see their own recovery requests
-- (This should work for both regular users and owners)

-- Test 2: Verify that owners can see all recovery requests
-- (This should work for users with owner role in employees table)

-- Test 3: Verify that users can create recovery requests
-- (This should work for any authenticated user)

-- Test 4: Verify that only owners can update recovery requests
-- (This should only work for users with owner role in employees table)

-- Example test queries (run these with different user contexts):

-- As a regular user (should only see their own requests):
-- SELECT * FROM account_recovery_requests;

-- As an owner (should see all requests):
-- SELECT * FROM account_recovery_requests;

-- Create a test recovery request (should work for any user):
-- INSERT INTO account_recovery_requests (email, reason, business_name) 
-- VALUES ('test@example.com', 'Test recovery', 'Test Business');

-- Update a recovery request (should only work for owners):
-- UPDATE account_recovery_requests 
-- SET status = 'approved' 
-- WHERE id = 'some-uuid-here';

-- Check current policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'account_recovery_requests'
ORDER BY policyname;

-- Check if RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'account_recovery_requests';
