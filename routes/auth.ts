import { Hono } from "hono";
import { getSupabaseClient } from "../utils/supabase.ts";
import { createError } from "../utils/errorHandler.ts";
import { conditionalAuthRateLimiter } from "../utils/rateLimiter.ts";
import { csrfTokenGenerator } from "../utils/csrf.ts";

const auth = new Hono();

// Register new user - Versión simplificada con error handler
auth.post("/register", async (c) => {
  const { email, password, name } = await c.req.json();
  const supabase = getSupabaseClient();

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

  return c.json({
    message: "User registered successfully. Please check your email to verify your account.",
    user: authData.user
  }, 201);
});

// Login user - Con rate limiting condicional (solo en producción)
auth.post("/login", conditionalAuthRateLimiter(), async (c) => {
  const { email, password } = await c.req.json();
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
    const supabase = getSupabaseClient();

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return c.json({ error: "Invalid token" }, 401);
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
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

// Logout user
auth.post("/logout", async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ message: "Logged out successfully" });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Logout failed";
    return c.json({ error: errorMessage }, 500);
  }
});

// ===== RUTA CSRF =====
auth.get("/csrf/token", csrfTokenGenerator(), async (c) => {
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