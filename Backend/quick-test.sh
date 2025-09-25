#!/bin/bash
echo "🧪 Testing routes on localhost:3030"
echo "=================================="

echo "1. Health check:"
curl -s http://localhost:3030/health | head -3

echo -e "\n2. CSRF token:"
curl -s -H "X-Session-ID: test-123" http://localhost:3030/api/auth/csrf/token

echo -e "\n3. Protected route (should be 401):"
curl -s http://localhost:3030/api/orders/test-business | head -2

echo -e "\n4. 404 test:"
curl -s http://localhost:3030/api/nonexistent | head -2

echo -e "\n✅ Tests completed!"
