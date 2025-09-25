#!/bin/bash

# Account Recovery Migration Script
# This script runs the account recovery requests table migration

set -e

echo "🔄 Running Account Recovery Migration..."

# Check if we're in the right directory
if [ ! -f "deno.json" ]; then
    echo "❌ Error: Please run this script from the Backend directory"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found. Please create one from .env.example"
    exit 1
fi

# Load environment variables
source .env

# Check if required environment variables are set
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env"
    exit 1
fi

echo "✅ Environment variables loaded"

# Run the migration
echo "📊 Executing account recovery requests migration..."
deno run --allow-net --allow-env migrations/account_recovery_requests.sql

echo "✅ Account Recovery Migration completed successfully!"
echo ""
echo "📋 What was created:"
echo "  - account_recovery_requests table"
echo "  - RLS policies for security"
echo "  - Indexes for performance"
echo "  - Helper functions for recovery status"
echo ""
echo "🔧 Next steps:"
echo "  1. Test the recovery endpoints"
echo "  2. Set up admin notifications for recovery requests"
echo "  3. Configure email templates for recovery process"
