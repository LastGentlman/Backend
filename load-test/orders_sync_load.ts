import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const syncSuccessRate = new Rate('sync_success_rate');
const syncDuration = new Trend('sync_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 },  // Ramp up to 10 users
    { duration: '5m', target: 10 },  // Stay at 10 users
    { duration: '2m', target: 20 },  // Ramp up to 20 users
    { duration: '5m', target: 20 },  // Stay at 20 users
    { duration: '2m', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.1'],     // Error rate must be less than 10%
    sync_success_rate: ['rate>0.9'],   // Success rate must be above 90%
  },
};

// Test data - Mock orders for sync testing
const mockOrders = [
  {
    client_generated_id: 'test-order-1',
    client_name: 'Juan Pérez',
    client_phone: '+525512345678',
    total: 150.00,
    delivery_date: '2024-01-15',
    delivery_time: '14:00',
    status: 'pending',
    notes: 'Test order 1',
    last_modified_at: new Date().toISOString(),
    items: [
      {
        product_name: 'Pizza Margherita',
        quantity: 2,
        unit_price: 75.00,
        notes: 'Extra cheese'
      }
    ]
  },
  {
    client_generated_id: 'test-order-2',
    client_name: 'María García',
    client_phone: '+525598765432',
    total: 200.00,
    delivery_date: '2024-01-16',
    delivery_time: '15:30',
    status: 'preparing',
    notes: 'Test order 2',
    last_modified_at: new Date().toISOString(),
    items: [
      {
        product_name: 'Hamburguesa',
        quantity: 1,
        unit_price: 120.00,
        notes: 'Sin cebolla'
      },
      {
        product_name: 'Papas Fritas',
        quantity: 1,
        unit_price: 80.00,
        notes: 'Extra sal'
      }
    ]
  }
];

// Test token (replace with real token for production testing)
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

// Base URL - Update this to match your environment
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3030';

export default function () {
  // Randomly select orders to sync (1-3 orders per request)
  const ordersToSync = [];
  const numOrders = Math.floor(Math.random() * 3) + 1;
  
  for (let i = 0; i < numOrders; i++) {
    const order = { ...mockOrders[i % mockOrders.length] };
    // Add unique timestamp to avoid conflicts
    order.client_generated_id = `load-test-${Date.now()}-${i}`;
    order.last_modified_at = new Date().toISOString();
    ordersToSync.push(order);
  }

  const payload = {
    orders: ordersToSync
  };

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_TOKEN}`,
    },
  };

  // Make sync request
  const startTime = Date.now();
  const response = http.post(`${BASE_URL}/api/orders/sync`, JSON.stringify(payload), params);
  const duration = Date.now() - startTime;

  // Record custom metrics
  syncDuration.add(duration);
  syncSuccessRate.add(response.status === 200);

  // Verify response
  const checks = check(response, {
    'status is 200': (r) => r.status === 200,
    'response has synced orders': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.synced && Array.isArray(body.synced);
      } catch {
        return false;
      }
    },
    'response has message': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.message && typeof body.message === 'string';
      } catch {
        return false;
      }
    },
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  // Log errors for debugging
  if (response.status !== 200) {
    console.error(`Sync failed: ${response.status} - ${response.body}`);
  }

  // Add some think time between requests
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

// Setup function (runs once before the test)
export function setup() {
  console.log('🚀 Starting Orders Sync Load Test');
  console.log(`📡 Target URL: ${BASE_URL}`);
  console.log(`🔑 Using test token: ${TEST_TOKEN.substring(0, 20)}...`);
  console.log(`📦 Mock orders prepared: ${mockOrders.length}`);
  
  // Optional: Verify endpoint is accessible
  const healthCheck = http.get(`${BASE_URL}/health`);
  if (healthCheck.status !== 200) {
    console.error('❌ Health check failed - make sure the server is running');
    throw new Error('Server not accessible');
  }
  console.log('✅ Health check passed');
}

// Teardown function (runs once after the test)
export function teardown() {
  console.log('🏁 Orders Sync Load Test completed');
}
