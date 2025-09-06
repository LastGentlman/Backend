import { Context } from "hono";
import { RedisService } from "../services/RedisService.ts";

// Redis-backed CSRF token storage (fallback handled by RedisService)
const redis = RedisService.getInstance();
const CSRF_PREFIX = "csrf";
const CSRF_TTL_SECONDS = 30 * 60; // 30 minutes

/**
 * Genera un token CSRF único
 */
export function generateCSRFToken(sessionId: string): string {
  const token = crypto.randomUUID();
  // Store token in Redis with TTL
  const key = `${CSRF_PREFIX}:${sessionId}`;
  console.log(`🔑 Generating CSRF token - Key: ${key}, Token: ${token}`);
  // Best effort async set, ignore errors to avoid crashing request path
  redis.setex(key, CSRF_TTL_SECONDS, token).catch((error) => {
    console.error(`❌ Failed to store CSRF token:`, error);
  });
  
  return token;
}

/**
 * Valida un token CSRF
 */
export function validateCSRFToken(sessionId: string, _token: string): boolean {
  const _key = `${CSRF_PREFIX}:${sessionId}`;
  // Synchronous-style check using async getter with simple deopt (will be awaited in middleware usage if needed)
  // Here we cannot block synchronously; callers should await an async variant if required.
  // For compatibility, we optimistically return true only after matching value.
  // Convert to blocking pattern in middleware below.
  throw new Error("validateCSRFToken should not be called directly; use validateCSRFTokenAsync in middleware");
}

export async function validateCSRFTokenAsync(sessionId: string, token: string): Promise<boolean> {
  try {
    const key = `${CSRF_PREFIX}:${sessionId}`;
    const stored = await redis.get(key);
    console.log(`🔍 CSRF Validation - Key: ${key}, Stored: ${stored}, Provided: ${token}`);
    if (!stored) {
      console.log(`❌ CSRF token not found for session: ${sessionId}`);
      return false;
    }
    const isValid = stored === token;
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
        '/api/orders/sync'  // Excluir sync para load testing
      ];
      if (excludedEndpoints.includes(path)) {
        await next();
        return;
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
    
    await next();
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