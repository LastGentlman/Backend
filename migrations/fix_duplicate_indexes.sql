-- ===== FIX DUPLICATE INDEXES MIGRATION =====
-- This migration removes duplicate indexes identified by Supabase database linter
-- Executed: [DATE_TO_BE_FILLED]

-- ===== REMOVE DUPLICATE INDEXES =====

-- 1. Fix branches table - Keep idx_branches_business_id (more descriptive), drop idx_branches_business
DROP INDEX IF EXISTS idx_branches_business;

-- 2. Fix businesses table - Keep idx_businesses_owner_id (more descriptive), drop idx_businesses_owner
DROP INDEX IF EXISTS idx_businesses_owner;

-- 3. Fix conflict_resolutions table - Keep idx_conflict_resolutions_order_id (more descriptive), drop idx_conflict_resolutions_order
DROP INDEX IF EXISTS idx_conflict_resolutions_order;

-- ===== ENSURE NECESSARY INDEXES EXIST =====

-- Ensure the kept indexes exist (in case they were the ones missing)
CREATE INDEX IF NOT EXISTS idx_branches_business_id ON branches(business_id);
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_order_id ON conflict_resolutions(order_id);

-- ===== CLEAN UP REDUNDANT INDEX CREATION =====

-- Note: Multiple files were creating the same indexes:
-- - main_schema.sql line 145: idx_conflict_resolutions_order_id
-- - fix_rls_performance.sql line 336: idx_conflict_resolutions_order_id  
-- - stored_procedures.sql line 222: idx_conflict_resolutions_order_id
-- This migration ensures only one version exists

-- ===== ANALYZE TABLES =====

-- Update statistics after index changes
ANALYZE branches;
ANALYZE businesses;
ANALYZE conflict_resolutions;

-- ===== MIGRATION SUMMARY =====

/*
This migration fixes the following duplicate index warnings:

1. Table `public.branches` had identical indexes:
   - Dropped: idx_branches_business
   - Kept: idx_branches_business_id

2. Table `public.businesses` had identical indexes:
   - Dropped: idx_businesses_owner  
   - Kept: idx_businesses_owner_id

3. Table `public.conflict_resolutions` had identical indexes:
   - Dropped: idx_conflict_resolutions_order
   - Kept: idx_conflict_resolutions_order_id

Performance improvement expected:
- Reduced index maintenance overhead
- Better query planner decisions
- Freed storage space from duplicate indexes
*/ 