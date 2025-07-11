import http from 'k6/http';
import { check } from 'k6';

// Quick test configuration
export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% of requests must complete below 1s
    http_req_failed: ['rate<0.1'],     // Error rate must be less than 10%
  },
};

// Base URL - Update this to match your environment
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3030';

export default function () {
  // Test health endpoint
  const healthResponse = http.get(`${BASE_URL}/health`);
  
  check(healthResponse, {
    'health status is 200': (r) => r.status === 200,
    'health response time < 1s': (r) => r.timings.duration < 1000,
    'health has status field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status && typeof body.status === 'string';
      } catch {
        return false;
      }
    },
  });

  // Test root endpoint
  const rootResponse = http.get(`${BASE_URL}/`);
  
  check(rootResponse, {
    'root status is 200': (r) => r.status === 200,
    'root response time < 1s': (r) => r.timings.duration < 1000,
    'root has message field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.message && typeof body.message === 'string';
      } catch {
        return false;
      }
    },
  });
}

// Setup function
export function setup() {
  console.log('🚀 Starting Quick Load Test');
  console.log(`📡 Target URL: ${BASE_URL}`);
  
  // Verify endpoint is accessible
  const healthCheck = http.get(`${BASE_URL}/health`);
  if (healthCheck.status !== 200) {
    console.error('❌ Health check failed - make sure the server is running');
    throw new Error('Server not accessible');
  }
  console.log('✅ Health check passed');
}

// Teardown function
export function teardown() {
  console.log('🏁 Quick Load Test completed');
} 