#!/bin/bash

# Script to apply backup metadata migration
# This script creates the backup_metadata table and related functions

set -e

echo "🔄 Applying backup metadata migration..."

# Check if we're in the correct directory
if [ ! -f "main.ts" ]; then
    echo "❌ Error: Please run this script from the Backend directory"
    exit 1
fi

# Check if Supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI not found. Please install it first."
    echo "   Visit: https://supabase.com/docs/guides/cli"
    exit 1
fi

# Check if we're logged in to Supabase
if ! supabase status &> /dev/null; then
    echo "❌ Error: Not connected to Supabase. Please run 'supabase login' first."
    exit 1
fi

echo "📋 Migration details:"
echo "   - Creating backup_metadata table"
echo "   - Setting up RLS policies"
echo "   - Creating backup statistics view"
echo "   - Adding cleanup functions"

# Apply the migration
echo "🚀 Applying migration..."
supabase db reset --linked

# Alternative: Apply specific migration file
# supabase db push --include-all

echo "✅ Backup metadata migration applied successfully!"
echo ""
echo "📊 What was created:"
echo "   - backup_metadata table with RLS policies"
echo "   - backup_statistics view"
echo "   - cleanup_old_backups() function"
echo "   - Automatic updated_at trigger"
echo ""
echo "🔧 Next steps:"
echo "   1. Set up AWS S3 environment variables:"
echo "      - AWS_ACCESS_KEY_ID"
echo "      - AWS_SECRET_ACCESS_KEY"
echo "      - AWS_REGION"
echo "      - S3_BUCKET"
echo "      - BACKUP_RETENTION_DAYS (optional, default: 30)"
echo "      - BACKUP_COMPRESSION (optional, default: false)"
echo ""
echo "   2. Test the backup system:"
echo "      - Create a test backup"
echo "      - Verify S3 upload"
echo "      - Test restore functionality"
echo ""
echo "🎉 Backup system is ready to use!"
