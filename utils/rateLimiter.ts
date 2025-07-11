import { Context, Next } from "hono";
import { getEnvironmentConfig } from "./config.ts";

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
export function conditionalRateLimiter(config: RateLimitConfig, _name: string = "default") {
  return async (c: Context, next: Next) => {
    const envConfig = getEnvironmentConfig();
    
    if (envConfig.rateLimiting.enabled) {
      // Aplicar rate limiting
      const rateLimiter = createRateLimiter(config);
      return rateLimiter(c, next);
    } else {
      // En desarrollo, solo pasar al siguiente middleware
      await next();
    }
  };
}

// Configuración por defecto usando config del entorno
export const defaultRateLimiter = () => {
  const config = getEnvironmentConfig();
  return createRateLimiter({
    windowMs: config.rateLimiting.windowMs,
    maxRequests: config.rateLimiting.defaultRequests
  });
};

// Rate limiter más estricto para auth endpoints
export const authRateLimiter = () => {
  const config = getEnvironmentConfig();
  return createRateLimiter({
    windowMs: config.rateLimiting.windowMs,
    maxRequests: config.rateLimiting.authRequests
  });
};

// Rate limiters condicionales (solo cuando está habilitado)
export const conditionalDefaultRateLimiter = () => {
  const config = getEnvironmentConfig();
  return conditionalRateLimiter({
    windowMs: config.rateLimiting.windowMs,
    maxRequests: config.rateLimiting.defaultRequests
  }, "default");
};

export const conditionalAuthRateLimiter = () => {
  const config = getEnvironmentConfig();
  return conditionalRateLimiter({
    windowMs: config.rateLimiting.windowMs,
    maxRequests: config.rateLimiting.authRequests
  }, "auth");
};

// Rate limiter inteligente que usa configuraciones según el entorno
export function smartRateLimiter() {
  return async (c: Context, next: Next) => {
    const config = getEnvironmentConfig();
    
    if (config.rateLimiting.enabled) {
      const rateLimiter = createRateLimiter({
        windowMs: config.rateLimiting.windowMs,
        maxRequests: config.rateLimiting.defaultRequests
      });
      return rateLimiter(c, next);
    } else {
      // Desarrollo: sin rate limiting
      await next();
    }
  };
} 