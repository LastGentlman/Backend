import { Context, Next } from "hono";

interface RateLimitConfig {
  windowMs: number; // Ventana de tiempo en ms
  maxRequests: number; // Máximo de requests por ventana
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

export function createRateLimiter(config: RateLimitConfig) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header("x-forwarded-for") || 
               c.req.header("x-real-ip") || 
               "unknown";
    
    const key = `rate_limit:${ip}`;
    const now = Date.now();
    
    // Limpiar entradas expiradas
    if (store[key] && now > store[key].resetTime) {
      delete store[key];
    }
    
    // Inicializar o incrementar contador
    if (!store[key]) {
      store[key] = {
        count: 1,
        resetTime: now + config.windowMs
      };
    } else {
      store[key].count++;
    }
    
    // Verificar límite
    if (store[key].count > config.maxRequests) {
      return c.json({
        error: "Too many requests",
        retryAfter: Math.ceil((store[key].resetTime - now) / 1000)
      }, 429);
    }
    
    // Agregar headers de rate limit
    c.header("X-RateLimit-Limit", config.maxRequests.toString());
    c.header("X-RateLimit-Remaining", (config.maxRequests - store[key].count).toString());
    c.header("X-RateLimit-Reset", new Date(store[key].resetTime).toISOString());
    
    await next();
  };
}

// Middleware que aplica rate limiting según el entorno
export function conditionalRateLimiter(config: RateLimitConfig, name: string = "default") {
  return async (c: Context, next: Next) => {
    const NODE_ENV = Deno.env.get("NODE_ENV") || "development";
    const isProduction = NODE_ENV === "production";
    const isStaging = NODE_ENV === "staging";
    
    if (isProduction || isStaging) {
      // Aplicar rate limiting
      const rateLimiter = createRateLimiter(config);
      return rateLimiter(c, next);
    } else {
      // En desarrollo, solo pasar al siguiente middleware
      await next();
    }
  };
}

// Configuración por defecto: 100 requests por minuto
export const defaultRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  maxRequests: 100
});

// Rate limiter más estricto para auth endpoints
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutos
  maxRequests: 5
});

// Rate limiters condicionales (solo en producción y staging)
export const conditionalDefaultRateLimiter = conditionalRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100
}, "default");

export const conditionalAuthRateLimiter = conditionalRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5
}, "auth");

// Configuraciones específicas para staging (más permisivas que producción)
export const stagingDefaultRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  maxRequests: 500 // Más permisivo que producción (100)
});

export const stagingAuthRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutos
  maxRequests: 20 // Más permisivo que producción (5)
});

// Rate limiter inteligente que usa configuraciones según el entorno
export function smartRateLimiter() {
  return async (c: Context, next: Next) => {
    const NODE_ENV = Deno.env.get("NODE_ENV") || "development";
    
    if (NODE_ENV === "production") {
      const rateLimiter = createRateLimiter({
        windowMs: 60 * 1000,
        maxRequests: 100
      });
      return rateLimiter(c, next);
    } else if (NODE_ENV === "staging") {
      const rateLimiter = createRateLimiter({
        windowMs: 60 * 1000,
        maxRequests: 500 // Más permisivo en staging
      });
      return rateLimiter(c, next);
    } else {
      // Desarrollo: sin rate limiting
      await next();
    }
  };
} 