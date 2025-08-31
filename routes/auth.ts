import { Hono } from "hono";
import { getSupabaseClient } from "../utils/supabase.ts";
import { createError } from "../utils/errorHandler.ts";
import { conditionalAuthRateLimiter } from "../utils/rateLimiter.ts";
import { csrfTokenGenerator } from "../utils/csrf.ts";
import { tokenService } from "../services/TokenManagementService.ts";
import { z } from "zod";
import { validateRequest, getValidatedData } from "../middleware/validation.ts";
import { strongPasswordSchema, validatePassword } from "../utils/passwordSecurity.ts";
import { SecureLogger } from "../utils/secureLogger.ts";
import { authMiddleware } from "../middleware/auth.ts";
import { getEmployeeFromContext, getUserFromContext } from "../types/context.ts";
import { emailNotificationService } from "../services/EmailNotificationService.ts";
import { dataExportService } from "../services/DataExportService.ts";

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: strongPasswordSchema,
  name: z.string().min(2).max(100)
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100)
});

const auth = new Hono();

// Register new user - Versión simplificada con error handler
auth.post("/register", validateRequest(registerSchema), async (c) => {
  const { email, password, name } = getValidatedData<typeof registerSchema._type>(c);
  const supabase = getSupabaseClient();
  const logger = SecureLogger.getInstance();

  // 🔒 ENHANCED: Additional password validation
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    logger.logSecurityEvent({
      level: 'warning',
      message: 'Weak password attempt during registration',
      data: { 
        email,
        strength: passwordValidation.strength,
        errors: passwordValidation.errors
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    });

    return c.json({
      error: "Contraseña débil",
      details: passwordValidation.errors,
      strength: passwordValidation.strength
    }, 400);
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name }
    }
  });

  // Si hay error, lanzar excepción (será capturada por errorHandler)
  if (authError) {
    if (authError.message.includes("already registered") || authError.message.includes("User already registered")) {
      throw createError("User with this email already exists.", 409);
    }
    throw createError(authError.message, 400);
  }

  if (!authData.user) {
    throw createError("Registration failed. Please try again.", 500);
  }

  // 🔒 ENHANCED: Log successful registration
  logger.logSecurityEvent({
    level: 'info',
    message: 'User registered successfully',
    data: { 
      email,
      userId: authData.user.id,
      strength: passwordValidation.strength.score
    },
    userId: authData.user.id,
    ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
  });

  return c.json({
    message: "User registered successfully. Please check your email to verify your account.",
    user: authData.user
  }, 201);
});

// Login user - Con rate limiting condicional (solo en producción)
auth.post("/login", conditionalAuthRateLimiter(), validateRequest(loginSchema), async (c) => {
  const { email, password } = getValidatedData<typeof loginSchema._type>(c);
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    if (error.message.includes("Email not confirmed")) {
      return c.json({
        error: "Email not confirmed. Please check your email and click the confirmation link before logging in.",
        code: "EMAIL_NOT_CONFIRMED"
      }, 401);
    }
    if (error.message.includes("Invalid login credentials") ||
        error.message.includes("Invalid email or password")) {
      return c.json({
        error: "Invalid email or password. Please check your credentials and try again.",
        code: "INVALID_CREDENTIALS"
      }, 401);
    }
    // Otros errores
    return c.json({
      error: error.message,
      code: "LOGIN_ERROR"
    }, 400);
  }

  // 🔒 NEW: Check if account is compromised before allowing login
  if (await tokenService.isAccountCompromisedAsync(data.user.id)) {
    return c.json({
      error: "Cuenta suspendida por seguridad",
      code: "ACCOUNT_COMPROMISED",
      message: "Tu cuenta ha sido suspendida. Contacta al administrador."
    }, 403);
  }

  return c.json({
    message: "Login successful",
    user: data.user,
    session: data.session
  });
});

// Development: Confirm email automatically (for testing)
auth.post("/confirm-email", async (c) => {
  try {
    const { email } = await c.req.json();
    const supabase = getSupabaseClient();

    // Get user by email
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      return c.json({ error: userError.message }, 500);
    }

    const user = users.find(u => u.email === email);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Confirm user email
    const { error: confirmError } = await supabase.auth.admin.updateUserById(
      user.id,
      { email_confirm: true }
    );

    if (confirmError) {
      return c.json({ error: confirmError.message }, 500);
    }

    return c.json({
      message: "Email confirmed successfully. You can now login.",
      user: { id: user.id, email: user.email }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Email confirmation failed";
    return c.json({ error: errorMessage }, 500);
  }
});

// Resend confirmation email
auth.post("/resend-confirmation", async (c) => {
  try {
    const { email } = await c.req.json();
    const supabase = getSupabaseClient();

    // Resend confirmation email
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email
    });

    if (error) {
      if (error.message.includes("User already confirmed")) {
        return c.json({ 
          message: "Email already confirmed. You can now login.",
          code: "EMAIL_ALREADY_CONFIRMED"
        });
      }
      throw createError(error.message, 400);
    }

    return c.json({
      message: "Confirmation email sent successfully. Please check your inbox.",
      code: "EMAIL_SENT"
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to resend confirmation email";
    return c.json({ error: errorMessage }, 500);
  }
});

// Change email for unconfirmed user
auth.post("/change-email", async (c) => {
  try {
    const { currentEmail, newEmail } = await c.req.json();
    const supabase = getSupabaseClient();

    // Get user by current email
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      return c.json({ error: userError.message }, 500);
    }

    const user = users.find(u => u.email === currentEmail);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Check if user is already confirmed
    if (user.email_confirmed_at) {
      return c.json({ 
        error: "Cannot change email for confirmed users",
        code: "USER_ALREADY_CONFIRMED"
      }, 400);
    }

    // Check if new email is already in use
    const existingUser = users.find(u => u.email === newEmail);
    if (existingUser) {
      return c.json({ 
        error: "Email already in use",
        code: "EMAIL_ALREADY_EXISTS"
      }, 409);
    }

    // Update user email
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { email: newEmail }
    );

    if (updateError) {
      return c.json({ error: updateError.message }, 500);
    }

    // Send confirmation email to new address
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: newEmail
    });

    if (resendError) {
      return c.json({ error: resendError.message }, 500);
    }

    return c.json({
      message: "Email changed successfully. Confirmation email sent to new address.",
      code: "EMAIL_CHANGED",
      newEmail
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to change email";
    return c.json({ error: errorMessage }, 500);
  }
});

// Get current user profile
auth.get("/profile", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid authorization header" }, 401);
    }

    const token = authHeader.substring(7);
    
    // 🔒 ENHANCED: Use TokenManagementService for validation
    const validationResult = await tokenService.validateToken(token);
    
    if (!validationResult.isValid) {
      return c.json({ 
        error: validationResult.error || "Invalid token",
        code: validationResult.code || "AUTH_TOKEN_INVALID"
      }, 401);
    }

    const user = validationResult.user;
    const supabase = getSupabaseClient();

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .single();

    if (profileError) {
      return c.json({ error: "Profile not found" }, 404);
    }

    return c.json({ profile });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to get profile";
    return c.json({ error: errorMessage }, 500);
  }
});

// Get current authenticated user (for frontend auth checking)
auth.get("/me", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing authorization header" }, 401);
    }

    const token = authHeader.substring(7);
    
    // 🔒 ENHANCED: Use TokenManagementService for validation
    const validationResult = await tokenService.validateToken(token);
    
    if (!validationResult.isValid) {
      return c.json({ 
        error: validationResult.error || "Invalid token"
      }, 401);
    }

    const user = validationResult.user;
    if (!user) {
      return c.json({ error: "User not found" }, 401);
    }

    // Return user data in the format expected by frontend
    return c.json({
      id: user.id,
      email: user.email,
      name: (user as unknown as { user_metadata?: { name?: string } }).user_metadata?.name || user.email?.split('@')[0] || 'Usuario',
      avatar_url: (user as unknown as { user_metadata?: { avatar_url?: string } }).user_metadata?.avatar_url,
      provider: 'email',
      businessId: (user as unknown as { user_metadata?: { businessId?: string } }).user_metadata?.businessId,
      role: (user as unknown as { user_metadata?: { role?: string } }).user_metadata?.role || 'owner'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to get user";
    return c.json({ error: errorMessage }, 500);
  }
});

// Enhanced logout user with token blacklisting
auth.post("/logout", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid authorization header" }, 401);
    }

    const token = authHeader.substring(7);
    
    // 🔒 ENHANCED: Use TokenManagementService for validation
    const validationResult = await tokenService.validateToken(token);
    
    if (!validationResult.isValid) {
      return c.json({ 
        error: validationResult.error || "Invalid token",
        code: validationResult.code || "AUTH_TOKEN_INVALID"
      }, 401);
    }

    // 🔒 NEW: Blacklist the token to prevent reuse
    tokenService.blacklistToken(token, 'User logout');

    // Sign out from Supabase
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ 
      message: "Logged out successfully",
      code: "LOGOUT_SUCCESS",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Logout failed";
    return c.json({ error: errorMessage }, 500);
  }
});

// 🔒 NEW: Force logout for compromised accounts (admin only)
auth.post("/force-logout/:userId", async (c) => {
  try {
    const { userId } = c.req.param();
    const authHeader = c.req.header("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid authorization header" }, 401);
    }

    const adminToken = authHeader.substring(7);
    
    // 🔒 ENHANCED: Use TokenManagementService for validation
    const validationResult = await tokenService.validateToken(adminToken);
    
    if (!validationResult.isValid) {
      return c.json({ 
        error: validationResult.error || "Invalid admin token",
        code: validationResult.code || "AUTH_TOKEN_INVALID"
      }, 401);
    }

    const adminUser = validationResult.user;
    const supabase = getSupabaseClient();

    // Check if admin has permission to force logout
    const { data: adminEmployee, error: employeeError } = await supabase
      .from('employees')
      .select('role')
      .eq('user_id', adminUser?.id)
      .eq('is_active', true)
      .single();

    if (employeeError || !adminEmployee || !['owner', 'admin'].includes(adminEmployee.role)) {
      return c.json({ 
        error: "Insufficient permissions to force logout",
        code: "INSUFFICIENT_PERMISSIONS"
      }, 403);
    }

    // 🔒 ENHANCED: Use TokenManagementService for force logout
    const success = await tokenService.forceLogoutUser(
      userId, 
      'Admin force logout', 
      adminUser?.id || ''
    );

    if (!success) {
      return c.json({ error: "Failed to force logout user" }, 500);
    }

    return c.json({ 
      message: "User forcefully logged out and account marked as compromised",
      code: "FORCE_LOGOUT_SUCCESS",
      userId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Force logout failed";
    return c.json({ error: errorMessage }, 500);
  }
});

// 🔒 NEW: Account recovery endpoint (for compromised accounts)
auth.post("/recover-account/:userId", async (c) => {
  try {
    const { userId } = c.req.param();
    const authHeader = c.req.header("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid authorization header" }, 401);
    }

    const adminToken = authHeader.substring(7);
    
    // 🔒 ENHANCED: Use TokenManagementService for validation
    const validationResult = await tokenService.validateToken(adminToken);
    
    if (!validationResult.isValid) {
      return c.json({ 
        error: validationResult.error || "Invalid admin token",
        code: validationResult.code || "AUTH_TOKEN_INVALID"
      }, 401);
    }

    const adminUser = validationResult.user;
    const supabase = getSupabaseClient();

    // Check if admin has permission
    const { data: adminEmployee, error: employeeError } = await supabase
      .from('employees')
      .select('role')
      .eq('user_id', adminUser?.id)
      .eq('is_active', true)
      .single();

    if (employeeError || !adminEmployee || adminEmployee.role !== 'owner') {
      return c.json({ 
        error: "Only owners can recover compromised accounts",
        code: "OWNER_REQUIRED"
      }, 403);
    }

    // 🔒 ENHANCED: Use TokenManagementService for account recovery
    const recovered = tokenService.recoverAccount(userId);

    if (!recovered) {
      return c.json({ 
        error: "Account is not marked as compromised",
        code: "ACCOUNT_NOT_COMPROMISED"
      }, 400);
    }

    return c.json({ 
      message: "Account recovered successfully",
      code: "ACCOUNT_RECOVERED",
      userId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Account recovery failed";
    return c.json({ error: errorMessage }, 500);
  }
});

// 🔒 NEW: Get token management statistics (admin only)
auth.get("/token-stats", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid authorization header" }, 401);
    }

    const adminToken = authHeader.substring(7);
    
    // 🔒 ENHANCED: Use TokenManagementService for validation
    const validationResult = await tokenService.validateToken(adminToken);
    
    if (!validationResult.isValid) {
      return c.json({ 
        error: validationResult.error || "Invalid admin token",
        code: validationResult.code || "AUTH_TOKEN_INVALID"
      }, 401);
    }

    const adminUser = validationResult.user;
    const supabase = getSupabaseClient();

    // Check if admin has permission
    const { data: adminEmployee, error: employeeError } = await supabase
      .from('employees')
      .select('role')
      .eq('user_id', adminUser?.id || '')
      .eq('is_active', true)
      .single();

    if (employeeError || !adminEmployee || !['owner', 'admin'].includes(adminEmployee.role)) {
      return c.json({ 
        error: "Insufficient permissions to view token statistics",
        code: "INSUFFICIENT_PERMISSIONS"
      }, 403);
    }

    // Get statistics from TokenManagementService
    const stats = await tokenService.getStatsAsync();

    return c.json({ 
      message: "Token management statistics",
      code: "TOKEN_STATS_SUCCESS",
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to get token statistics";
    return c.json({ error: errorMessage }, 500);
  }
});

// ===== RUTA CSRF =====
auth.get("/csrf/token", csrfTokenGenerator(), (c) => {
  const sessionId = c.req.header('X-Session-ID');
  
  if (!sessionId) {
    return c.json({
      error: 'Session ID requerido',
      code: 'SESSION_ID_MISSING'
    }, 400);
  }
  
  return c.json({
    message: 'Token CSRF generado exitosamente',
    sessionId
  });
});

// 🔒 NEW: Delete user account endpoint
auth.delete("/account", authMiddleware, async (c) => {
  try {
    const user = getUserFromContext(c);
    const employee = getEmployeeFromContext(c);
    
    if (!user) {
      return c.json({ 
        error: "Usuario no autenticado",
        code: "UNAUTHORIZED"
      }, 401);
    }

    const supabase = getSupabaseClient();

    // 🔒 SECURITY: Check if user has pending orders or active business
    if (employee) {
      // Check for pending orders
      const { data: pendingOrders, error: ordersError } = await supabase
        .from('orders')
        .select('id, status')
        .eq('business_id', employee.business_id)
        .in('status', ['pending', 'confirmed', 'in_progress']);

      if (ordersError) {
        console.error('Error checking pending orders:', ordersError);
        return c.json({ 
          error: "Error al verificar pedidos pendientes",
          code: "ORDERS_CHECK_ERROR"
        }, 500);
      }

      if (pendingOrders && pendingOrders.length > 0) {
        return c.json({ 
          error: "No puedes eliminar tu cuenta mientras tengas pedidos pendientes",
          code: "PENDING_ORDERS_EXIST",
          pendingOrders: pendingOrders.length
        }, 400);
      }

      // Check if user is the only owner of the business
      if (employee.role === 'owner') {
        const { data: otherOwners, error: ownersError } = await supabase
          .from('employees')
          .select('id, user_id')
          .eq('business_id', employee.business_id)
          .eq('role', 'owner')
          .eq('is_active', true);

        if (ownersError) {
          console.error('Error checking business owners:', ownersError);
          return c.json({ 
            error: "Error al verificar propietarios del negocio",
            code: "OWNERS_CHECK_ERROR"
          }, 500);
        }

        if (otherOwners && otherOwners.length === 1 && otherOwners[0].user_id === user.id) {
          return c.json({ 
            error: "No puedes eliminar tu cuenta si eres el único propietario del negocio. Transfiere la propiedad o elimina el negocio primero.",
            code: "SOLE_OWNER_CANNOT_DELETE"
          }, 400);
        }
      }
    }

    // 🔒 SECURITY: Log the account deletion attempt
    console.warn(`🗑️ Account deletion requested for user: ${user.email} (${user.id})`);

    // 📋 COMPLIANCE: Get user statistics for logging
    let userStats = { total_orders: 0, account_age_days: 0 };
    try {
      const { data: stats } = await supabase.rpc('get_user_deletion_stats', { p_user_id: user.id });
      if (stats && stats.length > 0) {
        userStats = stats[0];
      }
    } catch (statsError) {
      console.warn('Warning: Could not get user stats for logging:', statsError);
    }

    // 📊 COMPLIANCE: Export user data before deletion
    let exportData = null;
    try {
      exportData = await dataExportService.exportUserData(user.id, {
        includeOrders: true,
        includeBusinessData: !!employee,
        format: 'json',
        compress: false
      });
      console.log(`📊 Data export completed for user: ${user.email}`);
    } catch (exportError) {
      console.warn('Warning: Could not export user data:', exportError);
    }

    // 📋 COMPLIANCE: Log deletion to compliance table
    try {
      const { error: logError } = await supabase
        .from('account_deletion_logs')
        .insert({
          user_id: user.id,
          user_email: user.email,
          business_id: employee?.business_id || null,
          business_name: null, // Will be populated from business table if needed
          user_role: employee?.role || null,
          deletion_reason: 'self_deletion',
          total_orders: userStats.total_orders,
          account_age_days: userStats.account_age_days,
          ip_address: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
          user_agent: c.req.header('user-agent'),
          deletion_method: 'self_deletion',
          grace_period_start: new Date().toISOString(),
          grace_period_end: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
          data_exported: !!exportData,
          data_export_path: exportData?.file_path || null
        });

      if (logError) {
        console.error('Error logging deletion to compliance table:', logError);
      } else {
        console.log(`📋 Compliance log created for user: ${user.email}`);
      }
    } catch (logError) {
      console.error('Error creating compliance log:', logError);
    }

    // 🗑️ STEP 1: Delete user's avatar files from storage
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .single();

      if (profile?.avatar_url) {
        const avatarPath = profile.avatar_url.split('/').pop();
        if (avatarPath) {
          await supabase.storage
            .from('avatars')
            .remove([avatarPath]);
        }
      }
    } catch (storageError) {
      console.warn('Warning: Could not delete avatar files:', storageError);
      // Continue with account deletion even if avatar deletion fails
    }

    // 🗑️ STEP 2: Soft delete employee record (if exists)
    if (employee) {
      const { error: employeeError } = await supabase
        .from('employees')
        .update({ is_active: false })
        .eq('user_id', user.id);

      if (employeeError) {
        console.error('Error soft deleting employee:', employeeError);
        return c.json({ 
          error: "Error al eliminar datos del empleado",
          code: "EMPLOYEE_DELETE_ERROR"
        }, 500);
      }
    }

    // 🗑️ STEP 3: Soft delete profile data
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        is_active: false,
        deleted_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (profileError) {
      console.error('Error soft deleting profile:', profileError);
      return c.json({ 
        error: "Error al eliminar perfil",
        code: "PROFILE_DELETE_ERROR"
      }, 500);
    }

    // 🗑️ STEP 4: Blacklist all user tokens
    await tokenService.forceLogoutUser(user.id, 'Account deletion', user.id);

    // 🗑️ STEP 5: Delete user from Supabase Auth
    const { error: authError } = await supabase.auth.admin.deleteUser(user.id);
    
    if (authError) {
      console.error('Error deleting user from auth:', authError);
      return c.json({ 
        error: "Error al eliminar cuenta de autenticación",
        code: "AUTH_DELETE_ERROR"
      }, 500);
    }

    // ✅ SUCCESS: Log successful deletion
    console.log(`✅ Account successfully deleted for user: ${user.email} (${user.id})`);

    // 📧 EMAIL: Send notification to business owner if employee
    if (employee) {
      try {
        await emailNotificationService.notifyOwnerOfAccountDeletion({
          userEmail: employee.business_id ? 'owner@business.com' : user.email, // Send to business owner
          userName: user.email,
          businessName: employee.business_id ? 'Business Name' : undefined,
          userRole: employee.role,
          deletionDate: new Date().toISOString(),
          totalOrders: userStats.total_orders,
          accountAge: userStats.account_age_days
        });
      } catch (emailError) {
        console.warn('Warning: Could not send account deletion email notification:', emailError);
      }
    }

    return c.json({ 
      message: "Cuenta eliminada exitosamente",
      code: "ACCOUNT_DELETED_SUCCESS",
      userId: user.id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Unexpected error in DELETE /auth/account:', error);
    return c.json({ 
      error: "Error interno del servidor",
      code: "INTERNAL_SERVER_ERROR",
      details: error instanceof Error ? error.message : "Error desconocido"
    }, 500);
  }
});

// 🔄 NEW: Recover account during grace period
auth.post("/account/recover", async (c) => {
  try {
    const { email } = await c.req.json();
    
    if (!email) {
      return c.json({ 
        error: "Email requerido",
        code: "EMAIL_REQUIRED"
      }, 400);
    }

    const supabase = getSupabaseClient();

    // Check if account is in grace period
    const { data: deletionLog, error: logError } = await supabase
      .from('account_deletion_logs')
      .select('*')
      .eq('user_email', email)
      .eq('deletion_method', 'self_deletion')
      .gte('grace_period_end', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (logError || !deletionLog) {
      return c.json({ 
        error: "Cuenta no encontrada o período de gracia expirado",
        code: "ACCOUNT_NOT_FOUND_OR_EXPIRED"
      }, 404);
    }

    // Check if grace period has expired
    const gracePeriodEnd = new Date(deletionLog.grace_period_end);
    const now = new Date();
    
    if (now > gracePeriodEnd) {
      return c.json({ 
        error: "Período de gracia expirado. La cuenta ya no puede ser recuperada.",
        code: "GRACE_PERIOD_EXPIRED",
        grace_period_end: deletionLog.grace_period_end
      }, 400);
    }

    // Recover the account
    try {
      // 1. Reactivate profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          is_active: true,
          deleted_at: null
        })
        .eq('id', deletionLog.user_id);

      if (profileError) {
        console.error('Error reactivating profile:', profileError);
        return c.json({ 
          error: "Error al reactivar perfil",
          code: "PROFILE_RECOVERY_ERROR"
        }, 500);
      }

      // 2. Reactivate employee record if exists
      if (deletionLog.business_id) {
        const { error: employeeError } = await supabase
          .from('employees')
          .update({ 
            is_active: true,
            disassociated_at: null,
            disassociated_by: null
          })
          .eq('user_id', deletionLog.user_id)
          .eq('business_id', deletionLog.business_id);

        if (employeeError) {
          console.warn('Warning: Could not reactivate employee record:', employeeError);
        }
      }

      // 3. Remove from deletion logs (or mark as recovered)
      const { error: logUpdateError } = await supabase
        .from('account_deletion_logs')
        .update({ 
          data_exported: true, // Mark as recovered
          data_export_path: 'account_recovered'
        })
        .eq('id', deletionLog.id);

      if (logUpdateError) {
        console.warn('Warning: Could not update deletion log:', logUpdateError);
      }

      // 4. Log the recovery
      console.log(`✅ Account recovered for user: ${email} (${deletionLog.user_id})`);

      // 📧 EMAIL: Send recovery confirmation
      try {
        await emailNotificationService.sendAccountRecoveryConfirmation({
          userEmail: email,
          userName: email.split('@')[0], // Simple name extraction
          businessName: deletionLog.business_name,
          userRole: deletionLog.user_role,
          deletionDate: deletionLog.created_at
        });
      } catch (emailError) {
        console.warn('Warning: Could not send account recovery email notification:', emailError);
      }

      return c.json({ 
        message: "Cuenta recuperada exitosamente",
        code: "ACCOUNT_RECOVERED",
        user_id: deletionLog.user_id,
        grace_period_remaining: Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) + " días"
      });

    } catch (recoveryError) {
      console.error('Error during account recovery:', recoveryError);
      return c.json({ 
        error: "Error durante la recuperación de la cuenta",
        code: "RECOVERY_ERROR"
      }, 500);
    }

  } catch (error) {
    console.error('Unexpected error in POST /auth/account/recover:', error);
    return c.json({ 
      error: "Error interno del servidor",
      code: "INTERNAL_SERVER_ERROR"
    }, 500);
  }
});

// 🔍 NEW: Check account recovery status
auth.get("/account/recovery-status/:email", async (c) => {
  try {
    const email = c.req.param('email');
    
    if (!email) {
      return c.json({ 
        error: "Email requerido",
        code: "EMAIL_REQUIRED"
      }, 400);
    }

    const supabase = getSupabaseClient();

    // Check if account is in grace period
    const { data: deletionLog, error: logError } = await supabase
      .from('account_deletion_logs')
      .select('*')
      .eq('user_email', email)
      .eq('deletion_method', 'self_deletion')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (logError || !deletionLog) {
      return c.json({ 
        can_recover: false,
        reason: "Cuenta no encontrada o ya recuperada"
      });
    }

    // Check if grace period has expired
    const gracePeriodEnd = new Date(deletionLog.grace_period_end);
    const now = new Date();
    const canRecover = now <= gracePeriodEnd;
    
    const daysRemaining = canRecover 
      ? Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return c.json({
      can_recover: canRecover,
      deletion_date: deletionLog.created_at,
      grace_period_end: deletionLog.grace_period_end,
      days_remaining: daysRemaining,
      business_name: deletionLog.business_name,
      user_role: deletionLog.user_role,
      reason: canRecover 
        ? `Puedes recuperar tu cuenta. Quedan ${daysRemaining} días.`
        : "Período de gracia expirado. La cuenta ya no puede ser recuperada."
    });

  } catch (error) {
    console.error('Unexpected error in GET /auth/account/recovery-status/:email:', error);
    return c.json({ 
      error: "Error interno del servidor",
      code: "INTERNAL_SERVER_ERROR"
    }, 500);
  }
});

// 📊 NEW: Download exported user data
auth.get("/account/export/:userId", authMiddleware, async (c) => {
  try {
    const user = getUserFromContext(c);
    const employee = getEmployeeFromContext(c);
    const requestedUserId = c.req.param('userId');
    
    if (!user) {
      return c.json({ 
        error: "Usuario no autenticado",
        code: "UNAUTHORIZED"
      }, 401);
    }

    // Only allow users to download their own data or business owners to download employee data
    if (user.id !== requestedUserId && (!employee || employee.role !== 'owner')) {
      return c.json({ 
        error: "No tienes permisos para descargar estos datos",
        code: "INSUFFICIENT_PERMISSIONS"
      }, 403);
    }

    const supabase = getSupabaseClient();

    // Get the most recent export for this user
    const { data: deletionLog, error: logError } = await supabase
      .from('account_deletion_logs')
      .select('*')
      .eq('user_id', requestedUserId)
      .eq('data_exported', true)
      .not('data_export_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (logError || !deletionLog || !deletionLog.data_export_path) {
      return c.json({ 
        error: "No se encontraron datos exportados para este usuario",
        code: "EXPORT_NOT_FOUND"
      }, 404);
    }

    // Get the exported data
    const exportContent = await dataExportService.getExportFile(deletionLog.data_export_path);
    
    if (!exportContent) {
      return c.json({ 
        error: "El archivo de exportación no se encuentra",
        code: "EXPORT_FILE_NOT_FOUND"
      }, 404);
    }

    // Return the file
    return new Response(exportContent, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="user_data_${requestedUserId}_${deletionLog.created_at.split('T')[0]}.json"`
      }
    });

  } catch (error) {
    console.error('Unexpected error in GET /auth/account/export/:userId:', error);
    return c.json({ 
      error: "Error interno del servidor",
      code: "INTERNAL_SERVER_ERROR"
    }, 500);
  }
});

// 🎯 NEW: Token verification endpoint for offline authentication
const verifyTokenSchema = z.object({
  token: z.string().min(1)
});

auth.post("/verify-token", validateRequest(verifyTokenSchema), async (c) => {
  try {
    const { token } = getValidatedData<typeof verifyTokenSchema._type>(c);
    const logger = SecureLogger.getInstance();

    // 🔒 ENHANCED: Use TokenManagementService for comprehensive validation
    const validationResult = await tokenService.validateToken(token);
    
    if (!validationResult.isValid) {
      // 🔒 NEW: Log security event for invalid token verification
      logger.logSecurityEvent({
        level: 'warning',
        message: 'Invalid token verification attempt',
        data: { 
          reason: validationResult.error || 'Token inválido',
          code: validationResult.code || 'AUTH_TOKEN_INVALID'
        },
        ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
      });

      return c.json({ 
        valid: false,
        error: validationResult.error || 'Token inválido',
        code: validationResult.code || 'AUTH_TOKEN_INVALID'
      }, 401);
    }

    // 🔒 NEW: Log successful token verification
    logger.logSecurityEvent({
      level: 'info',
      message: 'Token verification successful',
      data: { 
        userId: validationResult.user?.id,
        email: validationResult.user?.email
      },
      userId: validationResult.user?.id,
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    });

    return c.json({ 
      valid: true,
      user: validationResult.user
    });

  } catch (error) {
    console.error('❌ Token verification error:', error);
    return c.json({ 
      valid: false,
      error: 'Error interno de verificación',
      code: 'AUTH_INTERNAL_ERROR'
    }, 500);
  }
});

// 🎯 NEW: Heartbeat endpoint for offline-aware authentication
const heartbeatSchema = z.object({
  timestamp: z.number(),
  userAgent: z.string().optional()
});

auth.post("/heartbeat", authMiddleware, validateRequest(heartbeatSchema), (c) => {
  try {
    const { timestamp, userAgent } = getValidatedData<typeof heartbeatSchema._type>(c);
    const user = getUserFromContext(c);
    const logger = SecureLogger.getInstance();

    // 🔒 NEW: Log heartbeat event
    logger.logSecurityEvent({
      level: 'info',
      message: 'Heartbeat received',
      data: { 
        timestamp,
        userAgent: userAgent || 'unknown',
        latency: Date.now() - timestamp
      },
      userId: user?.id,
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    });

    return c.json({ 
      success: true,
      timestamp: Date.now(),
      user: {
        id: user?.id,
        email: user?.email
      }
    });

  } catch (error) {
    console.error('❌ Heartbeat error:', error);
    return c.json({ 
      success: false,
      error: 'Error interno del heartbeat',
      code: 'HEARTBEAT_INTERNAL_ERROR'
    }, 500);
  }
});

export default auth; 