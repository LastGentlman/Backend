import { Context } from "hono";
import { getSupabaseClient } from "./supabase.ts";

// Supabase-backed CSRF token storage
const supabase = getSupabaseClient();
const CSRF_TTL_SECONDS = 30 * 60; // 30 minutes

/**
 * Genera un token CSRF único
 */
export function generateCSRFToken(sessionId: string): string {
  const token = crypto.randomUUID();
  console.log(`🔑 Generating CSRF token - SessionID: ${sessionId}, Token: ${token}`);
  
  // Store token in Supabase with TTL
  const expiresAt = new Date(Date.now() + CSRF_TTL_SECONDS * 1000);
  Promise.resolve(supabase.from('csrf_tokens').insert({
    session_id: sessionId,
    token: token,
    expires_at: expiresAt.toISOString()
  })).then(() => {
    console.log(`✅ CSRF token stored successfully for session: ${sessionId}`);
  }).catch((error: unknown) => {
    console.error(`❌ Failed to store CSRF token:`, error);
  });
  
  return token;
}

/**
 * Valida un token CSRF
 */
export function validateCSRFToken(_sessionId: string, _token: string): boolean {
  // Synchronous-style check using async getter with simple deopt (will be awaited in middleware usage if needed)
  // Here we cannot block synchronously; callers should await an async variant if required.
  // For compatibility, we optimistically return true only after matching value.
  // Convert to blocking pattern in middleware below.
  throw new Error("validateCSRFToken should not be called directly; use validateCSRFTokenAsync in middleware");
}

export async function validateCSRFTokenAsync(sessionId: string, token: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('csrf_tokens')
      .select('token')
      .eq('session_id', sessionId)
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    console.log(`🔍 CSRF Validation - SessionID: ${sessionId}, Provided: ${token}`);
    
    if (error || !data) {
      console.log(`❌ CSRF token not found or expired for session: ${sessionId}`);
      return false;
    }
    
    const isValid = data.token === token;
    console.log(`🔒 CSRF token validation result: ${isValid}`);
    return isValid;
  } catch (error) {
    console.error(`❌ CSRF validation error:`, error);
    return false;
  }
}

/**
 * Middleware CSRF para rutas protegidas
 */
export function csrfProtection() {
  return async (c: Context, next: () => Promise<void>) => {
    const method = c.req.method;
    const path = c.req.path;
    
    // Solo aplicar a métodos que modifican datos
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      // Excluir endpoints de autenticación y load testing de la protección CSRF
      const excludedEndpoints = [
        '/api/auth/login', 
        '/api/auth/register', 
        '/api/auth/forgot-password', 
        '/api/auth/reset-password', 
        '/api/auth/logout',
        '/api/auth/confirm-email',
        '/api/auth/resend-confirmation',
        '/api/auth/recover-account',
        '/api/orders/sync',  // Excluir sync para load testing
        '/api/business/activate-trial'  // Excluir activación de trial
      ];
      if (excludedEndpoints.includes(path)) {
        return await next();
      }
      
      const sessionId = c.req.header('X-Session-ID');
      const csrfToken = c.req.header('X-CSRF-Token');
      
      console.log(`🛡️ CSRF Protection - Path: ${path}, SessionID: ${sessionId}, Token: ${csrfToken}`);
      
      if (!sessionId || !csrfToken) {
        console.log(`❌ Missing CSRF headers - SessionID: ${!!sessionId}, Token: ${!!csrfToken}`);
        return c.json({
          error: 'CSRF token requerido',
          code: 'CSRF_TOKEN_MISSING'
        }, 403);
      }
      
      const isValid = await validateCSRFTokenAsync(sessionId, csrfToken);
      if (!isValid) {
        return c.json({
          error: 'CSRF token inválido',
          code: 'CSRF_TOKEN_INVALID'
        }, 403);
      }
    }
    
    return await next();
  };
}

/**
 * Middleware para generar token CSRF
 */
export function csrfTokenGenerator() {
  return async (c: Context, next: () => Promise<void>) => {
    const sessionId = c.req.header('X-Session-ID');
    
    if (sessionId) {
      const token = generateCSRFToken(sessionId);
      c.header('X-CSRF-Token', token);
    }
    
    await next();
  };
} 