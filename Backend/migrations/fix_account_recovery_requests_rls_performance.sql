-- Fix RLS Performance Issues for account_recovery_requests table
-- This migration addresses:
-- 1. Auth RLS Initialization Plan warnings by wrapping auth functions in SELECT subqueries
-- 2. Multiple Permissive Policies warnings by consolidating policies

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own recovery requests" ON account_recovery_requests;
DROP POLICY IF EXISTS "Users can create recovery requests" ON account_recovery_requests;
DROP POLICY IF EXISTS "Owners can update recovery requests" ON account_recovery_requests;
DROP POLICY IF EXISTS "Owners can view all recovery requests" ON account_recovery_requests;

-- Create optimized policies that fix both performance issues

-- Policy 1: Users can view their own recovery requests OR owners can view all
-- This consolidates the two SELECT policies into one, eliminating the multiple permissive policies warning
CREATE POLICY "Users can view own or all recovery requests" ON account_recovery_requests
  FOR SELECT USING (
    -- Users can see their own requests
    email = (SELECT auth.jwt() ->> 'email')
    OR
    -- Owners can see all requests
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.user_id = (SELECT auth.uid())
      AND employees.role = 'owner'
      AND employees.is_active = true
    )
  );

-- Policy 2: Users can create recovery requests (unchanged, but optimized)
CREATE POLICY "Users can create recovery requests" ON account_recovery_requests
  FOR INSERT WITH CHECK (true);

-- Policy 3: Only owners can update recovery requests (optimized with SELECT subquery)
CREATE POLICY "Owners can update recovery requests" ON account_recovery_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.user_id = (SELECT auth.uid())
      AND employees.role = 'owner'
      AND employees.is_active = true
    )
  );

-- Add comments explaining the optimizations
COMMENT ON POLICY "Users can view own or all recovery requests" ON account_recovery_requests IS 
'Optimized policy that consolidates user and owner SELECT access. Uses SELECT subqueries for auth functions to prevent re-evaluation per row.';

COMMENT ON POLICY "Owners can update recovery requests" ON account_recovery_requests IS 
'Optimized policy using SELECT subquery for auth.uid() to prevent re-evaluation per row.';
