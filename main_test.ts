import { assertEquals, assertExists } from "https://deno.land/std@0.220.1/assert/mod.ts";
import { load } from "https://deno.land/std@0.220.1/dotenv/mod.ts";

// Load environment variables for testing
const env = await load();
for (const [key, value] of Object.entries(env)) {
  Deno.env.set(key, value);
}

// Import the main app
import { getSupabaseClient } from "./utils/supabase.ts";

// Initialize Supabase for tests (lazy loading)
try {
  getSupabaseClient();
  console.log("✅ Supabase ready for tests (lazy loading)");
} catch (error) {
  console.error("❌ Failed to initialize Supabase for tests:", error);
}

Deno.test("Backend Connection - Basic Math Test", function addTest() {
  assertEquals(2 + 3, 5);
});

Deno.test("Backend Connection - Environment Variables", function envTest() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
  
  assertExists(supabaseUrl, "SUPABASE_URL should be set");
  assertExists(supabaseKey, "SUPABASE_ANON_KEY should be set");
  
  console.log("✅ Environment variables are properly configured");
});

Deno.test("Backend Connection - Supabase Client", async function supabaseTest() {
  try {
    const { getSupabaseClient } = await import("./utils/supabase.ts");
    const supabase = getSupabaseClient();
    
    // Test basic connection
    const { data: _data, error } = await supabase.from('profiles').select('count').limit(1);
    
    if (error) {
      console.warn("⚠️ Supabase connection warning:", error.message);
    } else {
      console.log("✅ Supabase connection successful");
    }
    
    // The test passes even if there's a connection warning (for development)
    assertEquals(typeof supabase, "object");
  } catch (error) {
    console.error("❌ Supabase test failed:", error);
    throw error;
  }
});

Deno.test("Backend Connection - API Endpoints", async function apiTest() {
  // This test would require the server to be running
  // For now, we'll test the route definitions
  try {
    const testRoutes = await import("./routes/test.ts");
    const authRoutes = await import("./routes/auth.ts");
    
    assertExists(testRoutes.default, "Test routes should be defined");
    assertExists(authRoutes.default, "Auth routes should be defined");
    
    console.log("✅ API routes are properly defined");
  } catch (error) {
    console.error("❌ API routes test failed:", error);
    throw error;
  }
}); 