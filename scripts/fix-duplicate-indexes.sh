#!/bin/bash

# ===== FIX DUPLICATE INDEXES SCRIPT =====
# This script applies the duplicate indexes fix migration to Supabase

set -e  # Exit on any error

echo "🔧 Starting duplicate indexes fix migration..."
echo "================================================"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ Error: psql is not installed or not in PATH"
    echo "Please install PostgreSQL client tools"
    exit 1
fi

# Check if migration file exists
MIGRATION_FILE="Backend/migrations/fix_duplicate_indexes.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Error: Migration file not found: $MIGRATION_FILE"
    exit 1
fi

# Database connection variables
if [ -z "$SUPABASE_DB_URL" ]; then
    echo "⚠️  SUPABASE_DB_URL environment variable not set"
    echo "Please set it to your Supabase database connection string:"
    echo "export SUPABASE_DB_URL='postgresql://postgres:[password]@[host]:[port]/postgres'"
    echo ""
    echo "You can find this in your Supabase project dashboard under Settings > Database"
    exit 1
fi

echo "📊 Checking current duplicate indexes..."

# Query to check for duplicate indexes (optional, for verification)
psql "$SUPABASE_DB_URL" -c "
SELECT 
    schemaname,
    tablename,
    indexname
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND (
        indexname LIKE 'idx_branches_business%' 
        OR indexname LIKE 'idx_businesses_owner%'
        OR indexname LIKE 'idx_conflict_resolutions_order%'
    )
ORDER BY tablename, indexname;
" || {
    echo "❌ Error: Could not connect to database"
    echo "Please check your SUPABASE_DB_URL"
    exit 1
}

echo ""
echo "🚀 Applying migration..."

# Apply the migration
psql "$SUPABASE_DB_URL" -f "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Migration applied successfully!"
    echo ""
    echo "📊 Verifying results..."
    
    # Check remaining indexes
    psql "$SUPABASE_DB_URL" -c "
    SELECT 
        schemaname,
        tablename,
        indexname
    FROM pg_indexes 
    WHERE schemaname = 'public' 
        AND (
            indexname LIKE 'idx_branches_business%' 
            OR indexname LIKE 'idx_businesses_owner%'
            OR indexname LIKE 'idx_conflict_resolutions_order%'
        )
    ORDER BY tablename, indexname;
    "
    
    echo ""
    echo "🎉 Duplicate indexes fix completed!"
    echo "Expected results:"
    echo "- Only idx_branches_business_id should remain for branches table"
    echo "- Only idx_businesses_owner_id should remain for businesses table"  
    echo "- Only idx_conflict_resolutions_order_id should remain for conflict_resolutions table"
else
    echo "❌ Migration failed!"
    exit 1
fi 