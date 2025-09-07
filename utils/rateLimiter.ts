import { Context, Next } from "hono";
import { getEnvironmentConfig } from "./config.ts";
// Using in-memory storage for rate limiting (can be moved to Supabase later)

interface RateLimitConfig {
  windowMs: number; // Ventana de tiempo en ms
  maxRequests: number; // Máximo de requests por ventana
}

// In-memory rate limiting stores
const rateLimitCounters = new Map<string, { count: number; resetTime: number }>();
const enhancedRateLimitCounters = new Map<string, { count: number; resetTime: number }>();
const failureCounters = new Map<string, { count: number; resetTime: number }>();
const RL_PREFIX = "rate_limit";
const RL_ENHANCED_PREFIX = "enhanced_rate_limit";
const RL_FAIL_PREFIX = "enhanced_fail";

export function createRateLimiter(config: RateLimitConfig) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header("x-forwarded-for") || 
               c.req.header("x-real-ip") || 
               "unknown";
    
    const windowSec = Math.ceil(config.windowMs / 1000);
    const key = `${RL_PREFIX}:${ip}`;
    const now = Date.now();
    const resetTime = now + config.windowMs;
    
    let counter = rateLimitCounters.get(key);
    if (!counter || counter.resetTime < now) {
      counter = { count: 0, resetTime };
      rateLimitCounters.set(key, counter);
    }
    
    counter.count++;
    const count = counter.count;
    const ttl = Math.ceil((counter.resetTime - now) / 1000);
    const retryAfter = ttl > 0 ? ttl : windowSec;
    const resetDate = new Date(Date.now() + retryAfter * 1000).toISOString();
    
    if (count > config.maxRequests) {
      return c.json({
        error: "Too many requests",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter
      }, 429, {
        "X-RateLimit-Limit": String(config.maxRequests),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": resetDate
      } as Record<string, string>);
    }
    
    // Agregar headers de rate limit
    c.header("X-RateLimit-Limit", config.maxRequests.toString());
    c.header("X-RateLimit-Remaining", Math.max(0, config.maxRequests - count).toString());
    c.header("X-RateLimit-Reset", resetDate);
    
    await next();
  };
}

// ✅ NEW: Load test specific rate limiter
export const loadTestRateLimiter = () => {
  return createRateLimiter({
    windowMs: 60 * 1000, // 1 minuto
    maxRequests: 50 // 50 requests por minuto para load tests
  });
};

// ✅ NEW: Orders sync specific rate limiter
export const ordersSyncRateLimiter = () => {
  return createRateLimiter({
    windowMs: 60 * 1000, // 1 minuto
    maxRequests: 100 // 100 sync requests por minuto
  });
};

// ✅ NEW: Enhanced rate limiter with failure tracking
export function createEnhancedRateLimiter(config: RateLimitConfig) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header("x-forwarded-for") || 
               c.req.header("x-real-ip") || 
               "unknown";
    
    const userAgent = c.req.header("user-agent") || "unknown";
    const windowSec = Math.ceil(config.windowMs / 1000);
    const key = `${RL_ENHANCED_PREFIX}:${ip}:${userAgent}`;
    const now = Date.now();
    const resetTime = now + config.windowMs;
    
    let counter = enhancedRateLimitCounters.get(key);
    if (!counter || counter.resetTime < now) {
      counter = { count: 0, resetTime };
      enhancedRateLimitCounters.set(key, counter);
    }
    
    counter.count++;
    const count = counter.count;
    const ttl = Math.ceil((counter.resetTime - now) / 1000);
    const retryAfter = ttl > 0 ? ttl : windowSec;
    const resetDate = new Date(Date.now() + retryAfter * 1000).toISOString();

    // Check failure counter for circuit breaker
    const failKey = `${RL_FAIL_PREFIX}:${ip}:${userAgent}`;
    const failCounter = failureCounters.get(failKey);
    const failCountRaw = failCounter && failCounter.resetTime > Date.now() ? failCounter.count.toString() : "0";
    const failCount = parseInt(failCountRaw ?? "0", 10) || 0;
    if (failCount >= 3) {
      console.error(`🚨 Enhanced circuit breaker for IP: ${ip}, UA: ${userAgent}`);
      return c.json({
        error: "Account temporarily suspended due to repeated failures",
        code: "ENHANCED_CIRCUIT_BREAKER",
        retryAfter
      }, 429, {
        "X-RateLimit-Limit": String(config.maxRequests),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": resetDate
      } as Record<string, string>);
    }

    if (count > config.maxRequests) {
      return c.json({
        error: "Rate limit exceeded",
        code: "ENHANCED_RATE_LIMIT_EXCEEDED",
        retryAfter
      }, 429, {
        "X-RateLimit-Limit": String(config.maxRequests),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": resetDate
      } as Record<string, string>);
    }
    
    // Agregar headers
    c.header("X-RateLimit-Limit", config.maxRequests.toString());
    c.header("X-RateLimit-Remaining", Math.max(0, config.maxRequests - count).toString());
    c.header("X-RateLimit-Reset", resetDate);
    
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

// ✅ NEW: Function to track failures for circuit breaker
export function trackFailure(ip: string, userAgent: string = "unknown") {
  const windowSec = Math.ceil(getEnvironmentConfig().rateLimiting.windowMs / 1000);
  const failKey = `${RL_FAIL_PREFIX}:${ip}:${userAgent}`;
  const now = Date.now();
  const resetTime = now + windowSec * 1000;
  
  let failCounter = failureCounters.get(failKey);
  if (!failCounter || failCounter.resetTime < now) {
    failCounter = { count: 0, resetTime };
    failureCounters.set(failKey, failCounter);
  }
  
  failCounter.count++;
}

// ✅ NEW: Function to reset failure count on success
export function resetFailureCount(ip: string, userAgent: string = "unknown") {
  const failKey = `${RL_FAIL_PREFIX}:${ip}:${userAgent}`;
  failureCounters.delete(failKey);
} 