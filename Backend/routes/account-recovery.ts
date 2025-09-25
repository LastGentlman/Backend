/**
 * Account Recovery Routes
 * 
 * Handles account recovery requests for deleted accounts
 */

import { Hono } from 'hono'
import { getSupabaseClient } from '../utils/supabase.ts'
import { authMiddleware } from '../middleware/auth.ts'

const router = new Hono()

interface AccountRecoveryRequest {
  email: string
  reason: string
  businessName?: string
  phoneNumber?: string
}

interface NewAccountRequest {
  email: string
  password: string
  businessName?: string
  isRecoveryAccount?: boolean
}

/**
 * POST /api/auth/account-recovery
 * Request account recovery
 */
router.post('/account-recovery', async (c) => {
  try {
    const body = await c.req.json() as AccountRecoveryRequest
    
    // Validate required fields
    if (!body.email || !body.reason) {
      return c.json({ error: 'Email y motivo son requeridos' }, 400)
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return c.json({ error: 'Formato de email inválido' }, 400)
    }

    // Check if user exists in deletion logs
    const supabase = getSupabaseClient()
    const { data: deletionLog, error: logError } = await supabase
      .from('account_deletion_logs')
      .select('*')
      .eq('user_email', body.email)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single()

    if (logError || !deletionLog) {
      return c.json({ error: 'No se encontró una cuenta eliminada con este email' }, 404)
    }

    // Check if recovery is still available (30 days after deletion)
    const deletionDate = new Date(deletionLog.completed_at || deletionLog.created_at)
    const now = new Date()
    const daysSinceDeletion = Math.floor((now.getTime() - deletionDate.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysSinceDeletion > 30) {
      return c.json({ 
        error: 'El período de recuperación ha expirado. Han pasado más de 30 días desde la eliminación.' 
      }, 400)
    }

    // Check if there's already a pending recovery request
    const { data: existingRequest, error: existingError } = await supabase
      .from('account_recovery_requests')
      .select('*')
      .eq('email', body.email)
      .eq('status', 'pending')
      .single()

    if (existingRequest && !existingError) {
      return c.json({ error: 'Ya existe una solicitud de recuperación pendiente para este email' }, 409)
    }

    // Create recovery request
    const { data: recoveryRequest, error: createError } = await supabase
      .from('account_recovery_requests')
      .insert({
        email: body.email,
        reason: body.reason,
        business_name: body.businessName,
        phone_number: body.phoneNumber,
        deletion_log_id: deletionLog.id,
        status: 'pending',
        requested_at: new Date().toISOString()
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating recovery request:', createError)
      return c.json({ error: 'Error creando solicitud de recuperación' }, 500)
    }

    // TODO: Send notification email to admin
    console.log('📧 Account recovery request created:', {
      id: recoveryRequest.id,
      email: body.email,
      reason: body.reason
    })

    return c.json({
      success: true,
      message: 'Solicitud de recuperación enviada exitosamente. Te contactaremos pronto.',
      recoveryId: recoveryRequest.id
    }, 201)

  } catch (error) {
    console.error('Error in account recovery request:', error)
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

/**
 * GET /api/auth/account-recovery/status
 * Check recovery request status
 */
router.get('/account-recovery/status', async (c) => {
  try {
    const email = c.req.query('email')
    
    if (!email) {
      return c.json({ error: 'Email es requerido' }, 400)
    }

    // Get the most recent recovery request
    const supabase = getSupabaseClient()
    const { data: recoveryRequest, error } = await supabase
      .from('account_recovery_requests')
      .select('*')
      .eq('email', email)
      .order('requested_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !recoveryRequest) {
      return c.json({
        hasPendingRequest: false,
        message: 'No se encontró solicitud de recuperación'
      })
    }

    return c.json({
      hasPendingRequest: recoveryRequest.status === 'pending',
      requestId: recoveryRequest.id,
      status: recoveryRequest.status,
      message: recoveryRequest.status === 'pending' 
        ? 'Tu solicitud está siendo procesada'
        : recoveryRequest.status === 'approved'
        ? 'Tu solicitud ha sido aprobada'
        : 'Tu solicitud ha sido rechazada'
    })

  } catch (error) {
    console.error('Error checking recovery status:', error)
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

/**
 * POST /api/auth/account-recovery/new-account
 * Create new account for deleted user
 */
router.post('/account-recovery/new-account', async (c) => {
  try {
    const body = await c.req.json() as NewAccountRequest
    
    // Validate required fields
    if (!body.email || !body.password) {
      return c.json({ error: 'Email y contraseña son requeridos' }, 400)
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return c.json({ error: 'Formato de email inválido' }, 400)
    }

    // Validate password strength
    if (body.password.length < 8) {
      return c.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)
    }

    // Check if email is already in use
    const supabase = getSupabaseClient()
    const { data: existingUser, error: userError } = await supabase.auth.admin.getUserById(body.email)
    
    if (existingUser && !userError) {
      return c.json({ error: 'Ya existe una cuenta con este email' }, 409)
    }

    // Create new user account
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        business_name: body.businessName,
        is_recovery_account: body.isRecoveryAccount || false,
        created_from_recovery: true
      }
    })

    if (createError || !newUser.user) {
      console.error('Error creating new user:', createError)
      return c.json({ error: 'Error creando nueva cuenta' }, 500)
    }

    // Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: newUser.user.id,
        email: body.email,
        business_name: body.businessName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    if (profileError) {
      console.error('Error creating profile:', profileError)
      // Don't fail the request, profile can be created later
    }

    // Log the new account creation
    console.log('✅ New account created for deleted user:', {
      userId: newUser.user.id,
      email: body.email,
      businessName: body.businessName,
      isRecoveryAccount: body.isRecoveryAccount
    })

    return c.json({
      success: true,
      message: 'Nueva cuenta creada exitosamente',
      userId: newUser.user.id
    }, 201)

  } catch (error) {
    console.error('Error creating new account:', error)
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

/**
 * GET /api/auth/account-recovery/requests (Admin only)
 * Get all recovery requests
 */
router.get('/account-recovery/requests', authMiddleware, async (c) => {
  try {
    // TODO: Add admin role check
    
    const supabase = getSupabaseClient()
    const { data: requests, error } = await supabase
      .from('account_recovery_requests')
      .select(`
        *,
        account_deletion_logs (
          user_email,
          deletion_reason,
          completed_at
        )
      `)
      .order('requested_at', { ascending: false })

    if (error) {
      console.error('Error fetching recovery requests:', error)
      return c.json({ error: 'Error obteniendo solicitudes de recuperación' }, 500)
    }

    return c.json({
      success: true,
      requests
    })

  } catch (error) {
    console.error('Error in get recovery requests:', error)
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

/**
 * PUT /api/auth/account-recovery/requests/:id (Admin only)
 * Update recovery request status
 */
router.put('/account-recovery/requests/:id', authMiddleware, async (c) => {
  try {
    // TODO: Add admin role check
    
    const requestId = c.req.param('id')
    const body = await c.req.json() as { status: 'approved' | 'rejected', notes?: string }
    
    if (!requestId || !body.status) {
      return c.json({ error: 'ID de solicitud y estado son requeridos' }, 400)
    }

    // Update recovery request
    const supabase = getSupabaseClient()
    const { data: updatedRequest, error } = await supabase
      .from('account_recovery_requests')
      .update({
        status: body.status,
        admin_notes: body.notes,
        processed_at: new Date().toISOString(),
        processed_by: c.get('user')?.['id']
      })
      .eq('id', requestId)
      .select()
      .single()

    if (error) {
      console.error('Error updating recovery request:', error)
      return c.json({ error: 'Error actualizando solicitud de recuperación' }, 500)
    }

    // If approved, restore the account
    if (body.status === 'approved') {
      // TODO: Implement account restoration logic
      console.log('🔄 Account recovery approved:', {
        requestId,
        email: updatedRequest.email
      })
    }

    return c.json({
      success: true,
      message: `Solicitud ${body.status === 'approved' ? 'aprobada' : 'rechazada'} exitosamente`,
      request: updatedRequest
    })

  } catch (error) {
    console.error('Error updating recovery request:', error)
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

export default router