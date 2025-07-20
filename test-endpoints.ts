#!/usr/bin/env -S deno run --allow-net --allow-env
// @ts-nocheck

const BASE_URL = Deno.env.get("BACKEND_URL") || "http://localhost:8000";

async function testEndpoints() {
  console.log("🧪 Testing new API endpoints...\n");

  // Test 1: GET /api/orders/:businessId
  console.log("1️⃣ Testing GET /api/orders/:businessId");
  try {
    const response = await fetch(`${BASE_URL}/api/orders/test-business-id`, {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    console.log(`   Status: ${response.status}`);
    if (response.status === 401) {
      console.log("   ✅ Expected 401 (authentication required)");
    } else {
      console.log("   ❌ Unexpected status");
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 2: PATCH /api/orders/:orderId/status
  console.log("\n2️⃣ Testing PATCH /api/orders/:orderId/status");
  try {
    const response = await fetch(`${BASE_URL}/api/orders/test-order-id/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'ready' })
    });
    console.log(`   Status: ${response.status}`);
    if (response.status === 401) {
      console.log("   ✅ Expected 401 (authentication required)");
    } else {
      console.log("   ❌ Unexpected status");
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 3: GET /api/dashboard/stats/:businessId
  console.log("\n3️⃣ Testing GET /api/dashboard/stats/:businessId");
  try {
    const response = await fetch(`${BASE_URL}/api/dashboard/stats/test-business-id`, {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    console.log(`   Status: ${response.status}`);
    if (response.status === 401) {
      console.log("   ✅ Expected 401 (authentication required)");
    } else {
      console.log("   ❌ Unexpected status");
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log("\n✅ Endpoint tests completed!");
  console.log("Note: 401 responses are expected without valid authentication tokens.");
}

if (import.meta.main) {
  await testEndpoints();
} 