#!/bin/bash

# ===== DENO LTS SETUP SCRIPT =====
# This script sets up Deno LTS version 2.2.14 for the project

set -e

echo "🚀 Setting up Deno LTS version 2.2.14..."

# Check if Deno is installed
if ! command -v deno &> /dev/null; then
    echo "❌ Deno is not installed. Please install Deno first."
    echo "Visit: https://deno.land/manual/getting_started/installation"
    exit 1
fi

# Get current Deno version
CURRENT_VERSION=$(deno --version | head -n1 | cut -d' ' -f2)
echo "📋 Current Deno version: $CURRENT_VERSION"

# Check if we're already on LTS
if [[ "$CURRENT_VERSION" == "2.2.14" ]]; then
    echo "✅ Already on Deno LTS version 2.2.14"
else
    echo "🔄 Upgrading to Deno LTS version 2.2.14..."
    deno upgrade --version 2.2.14
    echo "✅ Successfully upgraded to Deno LTS 2.2.14"
fi

# Verify installation
echo "🔍 Verifying installation..."
deno --version

# Cache dependencies
echo "📦 Caching project dependencies..."
deno cache main.ts

# Run type check
echo "🔍 Running type check..."
deno check main.ts

# Run linting
echo "🧹 Running linter..."
deno lint

# Run tests
echo "🧪 Running tests..."
deno test --allow-env --allow-net --allow-read

echo "✅ Deno LTS setup completed successfully!"
echo ""
echo "📋 Available commands:"
echo "  deno task dev     - Start development server"
echo "  deno task start   - Start production server"
echo "  deno task test    - Run tests"
echo "  deno task lint    - Run linter"
echo "  deno task fmt     - Format code"
echo "  deno task check   - Type check"
echo "  deno task build   - Cache dependencies"
echo "  deno task upgrade - Upgrade to LTS version"
