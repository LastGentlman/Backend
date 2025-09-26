// Test script for security logging endpoint
// Use environment variable or default to localhost:3030 for development
const BASE_URL = Deno.env.get('VITE_BACKEND_URL') || 'http://localhost:3030';

console.log('🔧 Using backend URL:', BASE_URL);
console.log('💡 To use a different URL, set VITE_BACKEND_URL environment variable');
console.log('   Example: VITE_BACKEND_URL=http://localhost:3030 deno run --allow-net --allow-env test-security-log.ts');

async function testSecurityLog() {
  try {
    console.log('🧪 Testing security logging endpoint...');
    
    const testData = {
      type: 'XSS_ATTEMPT_FRONTEND',
      payload: '<script>alert("test")</script>',
      source: 'test_script',
      context: 'test_context',
      timestamp: new Date().toISOString(),
      severity: 'HIGH'
    };
    
    const response = await fetch(`${BASE_URL}/api/monitoring/security/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Security log test passed:', result);
    } else {
      const error = await response.text();
      console.log('❌ Security log test failed:', error);
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testSecurityLog(); 