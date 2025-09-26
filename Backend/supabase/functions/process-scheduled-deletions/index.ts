/**
 * Edge Function: Process Scheduled Account Deletions
 * 
 * This function processes account deletions that have passed their grace period.
 * It should be called by a cron job or scheduled task.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeletionResult {
  user_id: string
  deletion_log_id: string
  success: boolean
  error?: string
  tables_cleaned?: string[]
}

interface ProcessResult {
  processed: number
  successful: number
  failed: number
  results: DeletionResult[]
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get accounts ready for deletion
    const { data: expiredDeletions, error: fetchError } = await supabase
      .rpc('get_accounts_ready_for_deletion')

    if (fetchError) {
      console.error('Error fetching expired deletions:', fetchError)
      throw new Error(`Failed to fetch expired deletions: ${fetchError.message}`)
    }

    if (!expiredDeletions || expiredDeletions.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'No accounts ready for deletion',
          processed: 0,
          successful: 0,
          failed: 0,
          results: []
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log(`Processing ${expiredDeletions.length} expired account deletions`)

    const results: DeletionResult[] = []
    let successful = 0
    let failed = 0

    // Process each deletion
    for (const deletion of expiredDeletions) {
      try {
        console.log(`Processing deletion for user ${deletion.user_id} (${deletion.user_email})`)

        // Call the process_account_deletion function
        const { data: processResult, error: processError } = await supabase
          .rpc('process_account_deletion', {
            deletion_log_id: deletion.deletion_log_id
          })

        if (processError) {
          console.error(`Error processing deletion for user ${deletion.user_id}:`, processError)
          results.push({
            user_id: deletion.user_id,
            deletion_log_id: deletion.deletion_log_id,
            success: false,
            error: processError.message
          })
          failed++
        } else if (processResult?.success) {
          console.log(`Successfully processed deletion for user ${deletion.user_id}`)
          results.push({
            user_id: deletion.user_id,
            deletion_log_id: deletion.deletion_log_id,
            success: true,
            tables_cleaned: processResult.tables_cleaned
          })
          successful++
        } else {
          console.error(`Deletion processing failed for user ${deletion.user_id}:`, processResult?.error)
          results.push({
            user_id: deletion.user_id,
            deletion_log_id: deletion.deletion_log_id,
            success: false,
            error: processResult?.error || 'Unknown error'
          })
          failed++
        }

      } catch (error) {
        console.error(`Unexpected error processing deletion for user ${deletion.user_id}:`, error)
        results.push({
          user_id: deletion.user_id,
          deletion_log_id: deletion.deletion_log_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        failed++
      }
    }

    const response: ProcessResult = {
      processed: expiredDeletions.length,
      successful,
      failed,
      results
    }

    console.log(`Deletion processing completed: ${successful} successful, ${failed} failed`)

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in process-scheduled-deletions function:', error)
    
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
