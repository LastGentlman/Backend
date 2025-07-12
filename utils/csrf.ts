import { Context } from "hono";

// Almacén de tokens CSRF (en producción usar Redis)
const csrfTokens = new Map<string, { token: string; expires: number }>();

/**
 * Genera un token CSRF único
 */
export function generateCSRFToken(sessionId: string): string {
  const token = crypto.randomUUID();
  const expires = Date.now() + (30 * 60 * 1000); // 30 minutos
  
  csrfTokens.set(sessionId, { token, expires });
  
  // Limpiar tokens expirados
  cleanupExpiredTokens();
  
  return token;
}

/**
 * Valida un token CSRF
 */
export function validateCSRFToken(sessionId: string, token: string): boolean {
  const stored = csrfTokens.get(sessionId);
  
  if (!stored) {
    return false;
  }
  
  if (Date.now() > stored.expires) {
    csrfTokens.delete(sessionId);
    return false;
  }
  
  if (stored.token !== token) {
    return false;
  }
  
  return true;
}

/**
 * Limpia tokens expirados
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [sessionId, data] of csrfTokens.entries()) {
    if (now > data.expires) {
      csrfTokens.delete(sessionId);
    }
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
      // Excluir endpoints de autenticación de la protección CSRF
      const authEndpoints = ['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password'];
      if (authEndpoints.includes(path)) {
        await next();
        return;
      }
      
      const sessionId = c.req.header('X-Session-ID');
      const csrfToken = c.req.header('X-CSRF-Token');
      
      if (!sessionId || !csrfToken) {
        return c.json({
          error: 'CSRF token requerido',
          code: 'CSRF_TOKEN_MISSING'
        }, 403);
      }
      
      if (!validateCSRFToken(sessionId, csrfToken)) {
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