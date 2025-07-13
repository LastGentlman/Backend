// Test script to verify logout endpoint works without CSRF
const BACKEND_URL = 'http://localhost:3030';

async function testLogout() {
  console.log('🧪 Testing logout endpoint...');
  
  try {
    // Test logout without CSRF token (should work now)
    const response = await fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    });
    
    console.log('📡 Logout response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Logout successful:', data);
    } else {
      const errorData = await response.json();
      console.log('❌ Logout failed:', errorData);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

// Run the test
testLogout(); 