#!/bin/bash

echo "🧪 Testing different environments..."
echo ""

echo "1️⃣ Development Mode:"
echo "NODE_ENV=development"
NODE_ENV=development deno run --allow-env --allow-net --allow-read main.ts &
DEV_PID=$!
sleep 3
kill $DEV_PID 2>/dev/null
echo ""

echo "2️⃣ Staging Mode:"
echo "NODE_ENV=staging"
NODE_ENV=staging deno run --allow-env --allow-net --allow-read main.ts &
STAGING_PID=$!
sleep 3
kill $STAGING_PID 2>/dev/null
echo ""

echo "3️⃣ Production Mode:"
echo "NODE_ENV=production"
NODE_ENV=production deno run --allow-env --allow-net --allow-read main.ts &
PROD_PID=$!
sleep 3
kill $PROD_PID 2>/dev/null
echo ""

echo "✅ Environment testing complete!" 