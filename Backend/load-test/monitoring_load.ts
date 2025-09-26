import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const monitoringSuccessRate = new Rate('monitoring_success_rate');
const monitoringDuration = new Trend('monitoring_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 5 },   // Ramp up to 5 users
    { duration: '3m', target: 5 },   // Stay at 5 users
    { duration: '1m', target: 10 },  // Ramp up to 10 users
    { duration: '3m', target: 10 },  // Stay at 10 users
    { duration: '1m', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% of requests must complete below 3s
    http_req_failed: ['rate<0.05'],    // Error rate must be less than 5%
    monitoring_success_rate: ['rate>0.95'], // Success rate must be above 95%
  },
};

// Test token (replace with real token for production testing)
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

// Base URL - Update this to match your environment
const BASE_URL = __ENV.BACKEND_URL || 'http://localhost:3030';

export default function () {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_TOKEN}`,
    },
  };

  // Test 1: Manual monitoring check
  const checkStartTime = Date.now();
  const checkResponse = http.post(`${BASE_URL}/api/monitoring/check`, JSON.stringify({}), params);
  const checkDuration = Date.now() - checkStartTime;

  monitoringDuration.add(checkDuration);
  monitoringSuccessRate.add(checkResponse.status === 200);

  check(checkResponse, {
    'monitoring check status is 200': (r: any) => r.status === 200,
    'monitoring check has metrics': (r: any) => {
      try {
        const body = JSON.parse(r.body);
        return body.metrics && typeof body.metrics === 'object';
      } catch {
        return false;
      }
    },
    'monitoring check response time < 3s': (r: any) => r.timings.duration < 3000,
  });

  // Add some think time
  sleep(Math.random() * 1 + 0.5); // 0.5-1.5 seconds

  // Test 2: Get monitoring alerts
  const alertsStartTime = Date.now();
  const alertsResponse = http.get(`${BASE_URL}/api/monitoring/alerts`, params);
  const alertsDuration = Date.now() - alertsStartTime;

  monitoringDuration.add(alertsDuration);
  monitoringSuccessRate.add(alertsResponse.status === 200);

  check(alertsResponse, {
    'alerts status is 200': (r: any) => r.status === 200,
    'alerts has statistics': (r: any) => {
      try {
        const body = JSON.parse(r.body);
        return body.statistics && typeof body.statistics === 'object';
      } catch {
        return false;
      }
    },
    'alerts response time < 2s': (r: any) => r.timings.duration < 2000,
  });

  // Add some think time
  sleep(Math.random() * 1 + 0.5); // 0.5-1.5 seconds

  // Test 3: Test alert (occasionally)
  if (Math.random() < 0.1) { // 10% chance
    const testAlertPayload = {
      type: 'warning',
      message: 'Load test alert',
      details: {
        test: true,
        timestamp: new Date().toISOString()
      }
    };

    const testAlertStartTime = Date.now();
    const testAlertResponse = http.post(
      `${BASE_URL}/api/monitoring/test-alert`, 
      JSON.stringify(testAlertPayload), 
      params
    );
    const testAlertDuration = Date.now() - testAlertStartTime;

    monitoringDuration.add(testAlertDuration);
    monitoringSuccessRate.add(testAlertResponse.status === 200);

    check(testAlertResponse, {
      'test alert status is 200': (r: any) => r.status === 200,
      'test alert response time < 5s': (r: any) => r.timings.duration < 5000,
    });
  }

  // Log errors for debugging
  if (checkResponse.status !== 200) {
    console.error(`Monitoring check failed: ${checkResponse.status} - ${checkResponse.body}`);
  }
  if (alertsResponse.status !== 200) {
    console.error(`Alerts failed: ${alertsResponse.status} - ${alertsResponse.body}`);
  }
}

// Setup function (runs once before the test)
export function setup() {
  console.log('🚀 Starting Monitoring Load Test');
  console.log(`📡 Target URL: ${BASE_URL}`);
  console.log(`🔑 Using test token: ${TEST_TOKEN.substring(0, 20)}...`);
  
  // Verify endpoint is accessible
  const healthCheck = http.get(`${BASE_URL}/health`);
  if (healthCheck.status !== 200) {
    console.error('❌ Health check failed - make sure the server is running');
    throw new Error('Server not accessible');
  }
  console.log('✅ Health check passed');
}

// Teardown function (runs once after the test)
export function teardown() {
  console.log('🏁 Monitoring Load Test completed');
}
