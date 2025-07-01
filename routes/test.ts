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

export default test 