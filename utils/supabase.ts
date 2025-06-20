import { createClient } from "@supabase/supabase-js";
import "https://deno.land/x/dotenv@v3.2.0/load.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

export const supabase = createClient(supabaseUrl, supabaseKey); 