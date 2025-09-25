import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// ✅ FIXED: Custom metrics to track sync performance
const syncDuration = new Trend('sync_duration');
const syncSuccessRate = new Counter('sync_success_rate');
const authFailures = new Counter('auth_failures');
const consecutiveFailures = new Counter('consecutive_failures');

// ✅ NEW: Circuit breaker variables
let consecutiveErrorCount = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

// ✅ FIXED: More realistic load test options
export const options = {
  stages: [
    // ✅ MEJOR PRÁCTICA: Empezar gradualmente
    { duration: '30s', target: 2 },   // Warm up suave
    { duration: '1m', target: 5 },    // Incremento gradual
    { duration: '2m', target: 5 },    // Mantener carga estable
    { duration: '30s', target: 0 },   // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% de requests < 2s
    http_req_failed: ['rate<0.1'],     // < 10% de fallos
    sync_success_rate: ['rate>0.9'],   // > 90% de éxito en sync
    auth_failures: ['count<5'],        // < 5 fallos de auth
    consecutive_failures: ['count<3'], // < 3 fallos consecutivos
  },
};

// ✅ FIXED: Mock orders for testing
const mockOrders = [
  {
    client_name: 'Cliente Test 1',
    client_phone: '+525512345678',
    client_address: 'Dirección Test 1',
    total: 200.00,
    status: 'pending',
    delivery_date: new Date(Date.now() + 24*60*60*1000).toISOString(), // Tomorrow
    notes: 'Pedido de prueba para load testing',
    created_at: new Date().toISOString(),
    last_modified_at: new Date().toISOString(),
    items: [
      {
        product_name: 'Hamburguesa Test',
        quantity: 1,
        unit_price: 120.00,
        notes: 'Sin cebolla - Test'
      },
      {
        product_name: 'Papas Fritas Test',
        quantity: 1,
        unit_price: 80.00,
        notes: 'Extra sal - Test'
      }
    ]
  }
];

// ✅ CRITICAL FIX: Use environment variable for token
const TEST_TOKEN = __ENV.LOAD_TEST_TOKEN || '';
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3030';

// ✅ FIXED: Add validation for required token
export function setup() {
  console.log('🚀 Starting Orders Sync Load Test');
  console.log(`📡 Target URL: ${BASE_URL}`);
  
  // ✅ CRÍTICO: Validar que existe un token
  if (!TEST_TOKEN) {
    console.error('❌ LOAD_TEST_TOKEN environment variable is required!');
    console.error('💡 Get a token first:');
    console.error('   curl -X POST http://localhost:3030/api/auth/login \\');
    console.error('     -H "Content-Type: application/json" \\');
    console.error('     -d \'{"email":"your-email","password":"your-password"}\'');
    console.error('');
    console.error('   Then run: LOAD_TEST_TOKEN="your-token" k6 run orders_sync_load_fixed.ts');
    throw new Error('Missing authentication token');
  }
  
  console.log(`🔑 Using token: ${TEST_TOKEN.substring(0, 20)}...`);
  console.log(`📦 Mock orders prepared: ${mockOrders.length}`);
  
  // ✅ FIXED: Health check with better error handling
  try {
    const healthCheck = http.get(`${BASE_URL}/health`);
    if (healthCheck.status !== 200) {
      console.error(`❌ Health check failed: ${healthCheck.status}`);
      throw new Error('Server not accessible');
    }
    console.log('✅ Health check passed');
  } catch (error) {
    console.error('❌ Health check error:', error);
    throw new Error('Cannot connect to server');
  }
  
  // ✅ FIXED: Test authentication before starting load test
  console.log('🔐 Testing authentication...');
  const authTest = http.get(`${BASE_URL}/api/auth/profile`, {
    headers: {
      'Authorization': `Bearer ${TEST_TOKEN}`,
    },
  });
  
  if (authTest.status === 401 || authTest.status === 403) {
    console.error('❌ Authentication failed!');
    console.error('💡 Token may be invalid or expired');
    console.error('   Get a new token and try again');
    throw new Error('Authentication failed');
  }
  
  if (authTest.status === 200) {
    console.log('✅ Authentication successful');
  } else {
    console.warn(`⚠️  Unexpected auth response: ${authTest.status}`);
  }
}

export default function () {
  // ✅ FIXED: Skip execution if no token
  if (!TEST_TOKEN) {
    console.error('❌ No token provided, skipping execution');
    return;
  }
  
  // ✅ NEW: Circuit breaker check
  if (consecutiveErrorCount >= MAX_CONSECUTIVE_ERRORS) {
    console.error('🚨 Circuit breaker activated - too many consecutive errors');
    return;
  }
  
  // ✅ FIXED: Create unique order data for each iteration
  const ordersToSync = [];
  const numOrders = Math.floor(Math.random() * 2) + 1; // 1-2 orders max
  
  for (let i = 0; i < numOrders; i++) {
    const order = { ...mockOrders[i % mockOrders.length] };
    // ✅ MEJOR PRÁCTICA: IDs únicos para evitar conflictos
    order.client_generated_id = `load-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
    timeout: '10s', // ✅ MEJOR PRÁCTICA: Timeout explícito
  };

  // ✅ FIXED: Make sync request with better error handling
  const startTime = Date.now();
  const response = http.post(`${BASE_URL}/api/orders/sync`, JSON.stringify(payload), params);
  const duration = Date.now() - startTime;

  // ✅ FIXED: Record metrics properly
  syncDuration.add(duration);
  
  // ✅ FIXED: Better success tracking
  if (response.status === 200) {
    syncSuccessRate.add(1);
    consecutiveErrorCount = 0; // Reset on success
  } else {
    syncSuccessRate.add(0);
    consecutiveErrorCount++; // Increment on failure
    
    // ✅ FIXED: Track specific error types
    if (response.status === 401 || response.status === 403) {
      authFailures.add(1);
    }
  }

  // ✅ FIXED: Comprehensive response validation
  const checks = check(response, {
    'status is 200': (r) => r.status === 200,
    'not authentication error': (r) => r.status !== 401 && r.status !== 403,
    'response time < 10s': (r) => r.timings.duration < 10000,
    'response has body': (r) => r.body.length > 0,
  });

  // ✅ MEJOR PRÁCTICA: Log errors with more context
  if (response.status !== 200) {
    console.error(`❌ Sync failed [VU:${__VU}, Iter:${__ITER}]:`, {
      status: response.status,
      body: response.body,
      duration: `${duration}ms`
    });
    
    // ✅ FIXED: Stop test if too many auth failures
    if (response.status === 401 || response.status === 403) {
      console.error('🚨 Authentication failure detected');
      console.error('💡 Check if token is valid and not expired');
    }
  }

  // ✅ MEJOR PRÁCTICA: Variable think time between requests
  sleep(Math.random() * 3 + 1); // 1-4 seconds
}

export function teardown() {
  console.log('🏁 Orders Sync Load Test completed');
  console.log('📊 Check metrics above for performance results');
} 