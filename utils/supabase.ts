import { createClient } from "@supabase/supabase-js";

// Function to create Supabase client after env vars are loaded
export function createSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("⚠️ Missing Supabase environment variables - using mock client for testing");
    // Return a mock client for testing
    return {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        getUser: () => Promise.resolve({ data: { user: null }, error: null })
      },
      from: () => ({
        select: () => ({ 
          eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
          limit: () => Promise.resolve({ data: [], error: null })
        }),
        insert: () => Promise.resolve({ data: null, error: null }),
        update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) })
      })
    } as any;
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// Lazy initialization with proper typing
let supabaseClient: ReturnType<typeof createSupabaseClient> | null = null;

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient();
  }
  return supabaseClient;
}

// Helper function to get user from JWT token
export async function getUserFromToken(token: string) {
  const client = getSupabaseClient();
  const { data: { user }, error } = await client.auth.getUser(token);
  
  if (error || !user) {
    throw new Error("Invalid token");
  }
  
  return user;
}

// Helper function to get business context
export async function getBusinessContext(userId: string) {
  const client = getSupabaseClient();
  const { data: employee, error: employeeError } = await client
    .from('employees')
    .select(`
      *,
      business:businesses(*)
    `)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (employeeError || !employee) {
    throw new Error("User not associated with any business");
  }

  return {
    employee,
    business: employee.business,
    isOwner: employee.role === 'owner'
  };
} 