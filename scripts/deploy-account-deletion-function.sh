#!/bin/bash

# Deploy Account Deletion Edge Function
# This script deploys the process-scheduled-deletions Edge Function to Supabase

set -e

echo "🚀 Deploying Account Deletion Edge Function..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "supabase/functions/process-scheduled-deletions/index.ts" ]; then
    echo "❌ Edge Function not found. Please run this script from the Backend directory."
    exit 1
fi

# Deploy the function
echo "📦 Deploying process-scheduled-deletions function..."
supabase functions deploy process-scheduled-deletions

if [ $? -eq 0 ]; then
    echo "✅ Edge Function deployed successfully!"
    echo ""
    echo "🔧 Next steps:"
    echo "1. Set up a cron job to call this function periodically"
    echo "2. Test the function with: supabase functions invoke process-scheduled-deletions"
    echo "3. Monitor the function logs: supabase functions logs process-scheduled-deletions"
    echo ""
    echo "📋 Function URL: https://your-project.supabase.co/functions/v1/process-scheduled-deletions"
else
    echo "❌ Failed to deploy Edge Function"
    exit 1
fi
