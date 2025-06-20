import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { load } from "https://deno.land/std@0.220.1/dotenv/mod.ts";

// Load environment variables
const env = await load();

// Get Supabase credentials
const supabaseUrl = env['SUPABASE_URL'];
const supabaseKey = env['SUPABASE_ANON_KEY'];

console.log('Attempting to connect to Supabase with URL:', !!supabaseUrl);

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables in .env file')
}

export const supabase = createClient(supabaseUrl, supabaseKey) 