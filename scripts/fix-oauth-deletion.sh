#!/bin/bash

# Fix OAuth Account Deletion Issue
# This script applies the fix for OAuth account deletion

echo "🔧 Applying OAuth account deletion fix..."

# Check if we have database connection
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Please install PostgreSQL client."
    exit 1
fi

# Apply the migration
echo "📋 Applying migration: fix_oauth_account_deletion.sql"

# You'll need to set your database URL
# Example: export DATABASE_URL="postgresql://postgres:password@localhost:5432/your_db"

if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable not set."
    echo "Please set it to your Supabase database URL:"
    echo "export DATABASE_URL='postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres'"
    exit 1
fi

# Apply the migration
psql "$DATABASE_URL" -f "../migrations/fix_oauth_account_deletion.sql"

if [ $? -eq 0 ]; then
    echo "✅ OAuth account deletion fix applied successfully!"
    echo ""
    echo "🧪 To test the fix:"
    echo "1. Create a test OAuth user (Google/GitHub)"
    echo "2. Try to delete the account"
    echo "3. Verify the user is properly logged out and can't access"
    echo ""
    echo "🔍 To verify the triggers are updated:"
    echo "SELECT proname FROM pg_proc WHERE proname LIKE '%account_deletion%';"
else
    echo "❌ Failed to apply migration. Check the error above."
    exit 1
fi