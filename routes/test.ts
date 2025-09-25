import { Hono } from "https://deno.land/x/hono@v3.12.0/mod.ts"
import { getSupabaseClient } from '../utils/supabase.ts'

const test = new Hono()

test.get('/test-connection', async (c) => {
  try {
    const supabase = getSupabaseClient();
    
    // Simple query to test connection, checks if 'profiles' table exists.
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)

    if (error) {
      console.error("Supabase connection error:", error);
      return c.json({
        status: 'error',
        message: 'Failed to connect to Supabase.',
        error: error.message
      }, 500)
    }

    return c.json({
      status: 'success',
      message: 'Successfully connected to Supabase!',
      data: data
    })
  } catch (err) {
    console.error("Unexpected error:", err);
    return c.json({
      status: 'error',
      message: 'An unexpected error occurred.',
      error: err instanceof Error ? err.message : String(err),
    }, 500)
  }
})

// Endpoint para crear un negocio de prueba (sin autenticación para desarrollo)
test.post('/setup-demo-business', async (c) => {
  try {
    const supabase = getSupabaseClient();
    
    // Crear un negocio de prueba
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .insert({
        name: 'Demo Business',
        owner_id: 'demo-user-id', // Esto se actualizará después
        subscription_status: 'trial',
        trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 días
        settings: {
          currency: 'USD',
          timezone: 'America/New_York',
          notifications: {
            email: true,
            push: true
          }
        }
      })
      .select()
      .single();

    if (businessError) {
      console.error("Error creating business:", businessError);
      return c.json({
        status: 'error',
        message: 'Failed to create business.',
        error: businessError.message
      }, 500);
    }

    // Crear una sucursal por defecto
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .insert({
        business_id: business.id,
        name: 'Sucursal Principal',
        address: 'Dirección de prueba',
        phone: '+1234567890',
        is_active: true
      })
      .select()
      .single();

    if (branchError) {
      console.error("Error creating branch:", branchError);
      return c.json({
        status: 'error',
        message: 'Failed to create branch.',
        error: branchError.message
      }, 500);
    }

    return c.json({
      status: 'success',
      message: 'Demo business created successfully!',
      business: {
        id: business.id,
        name: business.name,
        subscription_status: business.subscription_status
      },
      branch: {
        id: branch.id,
        name: branch.name
      }
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return c.json({
      status: 'error',
      message: 'An unexpected error occurred.',
      error: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

export default test 