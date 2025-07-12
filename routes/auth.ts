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
  if (tokenService.isAccountCompromised(data.user.id)) {
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
    const stats = tokenService.getStats();

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

export default auth; 