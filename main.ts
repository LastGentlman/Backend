import { Hono } from "hono";
import { cors } from "hono/cors";
import { load } from "https://deno.land/std@0.220.1/dotenv/mod.ts";
import { initializeSupabase } from "./utils/supabase.ts";
import { requestLogger } from "./utils/logger.ts";
import { smartRateLimiter } from "./utils/rateLimiter.ts";
import { getEnvironmentConfig, logEnvironmentConfig, validateEnvironmentVariables } from "./utils/config.ts";
import { securityHeadersMiddleware } from "./utils/security.ts";
import { authMiddleware } from "./middleware/auth.ts";

// Import routes
import testRoutes from "./routes/test.ts";
import ordersRoutes from "./routes/orders.ts";
import authRoutes from "./routes/auth.ts";
import businessRoutes from "./routes/business.ts";
import notificationsRoutes from "./routes/notifications.ts";
import monitoringRoutes from "./routes/monitoring.ts";
import whatsappRoutes from "./routes/whatsapp.ts";

// ===== LOAD ENVIRONMENT VARIABLES =====
const env = await load();
console.log("✅ Environment variables loaded");

// Set environment variables for Deno
for (const [key, value] of Object.entries(env)) {
  Deno.env.set(key, value);
}

// ===== VALIDATION & CONFIGURATION =====
validateEnvironmentVariables();
const config = getEnvironmentConfig();

console.log(`🌍 Environment: ${config.name}`);
logEnvironmentConfig();

// ===== INITIALIZE SUPABASE =====
try {
  initializeSupabase();
  console.log("✅ Supabase client initialized");
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  console.error("❌ Failed to initialize Supabase:", errorMessage);
  throw error;
}

// ===== CREATE HONO APP =====
const app = new Hono();

// ===== GLOBAL MIDDLEWARES (CRITICAL ORDER) =====

// 1. Pretty JSON middleware (only in development/staging)
if (config.name !== 'production') {
  app.use("*", async (c, next) => {
    await next();
    if (c.res.headers.get("content-type")?.includes("application/json")) {
      const body = await c.res.json();
      c.res = new Response(JSON.stringify(body, null, 2), {
        headers: c.res.headers,
        status: c.res.status,
      });
    }
  });
  console.log("📝 Pretty JSON enabled for development");
} else {
  console.log("📝 Pretty JSON disabled for production (optimized responses)");
}

// 2. Security headers
app.use("*", securityHeadersMiddleware());

// 3. Rate limiting
app.use("*", smartRateLimiter());

// 4. Request logging
app.use("*", requestLogger);

// 5. CORS with environment-specific origins
app.use("*", cors({
  origin: config.cors.origins,
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600, // Cache preflight for 10 minutes
}));

// ===== ROOT ENDPOINT =====
app.get("/", (c) => {
  return c.json({ 
    message: "PedidoList API", 
    version: "1.0.0",
    status: "running",
    environment: config.name,
    rateLimiting: config.rateLimiting.enabled ? "enabled" : "disabled",
    debugMode: config.features.debugMode,
    security: config.security.strictCORS ? "strict" : "permissive"
  });
});

// ===== HEALTH CHECK =====
app.get("/health", async (c) => {
  try {
    const { getSupabaseClient } = await import("./utils/supabase.ts");
    const supabase = getSupabaseClient();
    
    // Basic connectivity test
    const { error } = await supabase.from('profiles').select('count').limit(1);
    
    return c.json({
      status: "healthy",
      database: error ? "error" : "connected",
      timestamp: new Date().toISOString(),
      environment: config.name,
      rateLimiting: config.rateLimiting.enabled ? "enabled" : "disabled",
      security: config.security.strictCORS ? "strict" : "permissive",
      version: "1.0.0"
    });
  } catch (error) {
    console.error("❌ Health check failed:", error);
    return c.json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// ===== PUBLIC ROUTES (no authentication required) =====
app.route("/api/auth", authRoutes);

// ===== AUTHENTICATION MIDDLEWARE =====
// Apply middleware BEFORE registering protected routes
app.use("/api/orders/*", authMiddleware);
app.use("/api/business/*", authMiddleware);
app.use("/api/test/*", authMiddleware);
app.use("/api/notifications/*", authMiddleware);
app.use("/api/monitoring/*", authMiddleware);
app.use("/api/whatsapp/*", authMiddleware);

// ===== PROTECTED ROUTES (require authentication) =====
app.route("/api/test", testRoutes);
app.route("/api/orders", ordersRoutes);
app.route("/api/business", businessRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/monitoring", monitoringRoutes);
app.route("/api/whatsapp", whatsappRoutes);

// ===== 404 HANDLER =====
app.notFound((c) => {
  console.log(`❌ 404: ${c.req.method} ${c.req.path}`);
  return c.json({ 
    error: "Endpoint no encontrado",
    path: c.req.path,
    method: c.req.method,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      "GET /health",
      "POST /api/auth/login",
      "POST /api/auth/register", 
      "GET /api/orders",
      "POST /api/orders",
      "GET /api/business",
      "POST /api/notifications/subscribe",
      "GET /api/test/test-connection"
    ]
  }, 404);
});

// ===== GLOBAL ERROR HANDLER (must be LAST) =====
app.onError((error, c) => {
  console.error("🚨 Unhandled error:", error);
  
  // Detailed error logging
  const user = c.get('user') as Record<string, unknown> | undefined;
  const context = c.get('context') as Record<string, unknown> | undefined;
  const business = context?.business as Record<string, unknown> | undefined;
  
  const errorLog = {
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    path: c.req.path,
    method: c.req.method,
    timestamp: new Date().toISOString(),
    userId: user?.id,
    businessId: business?.id
  };

  if (config.logging.detailed) {
    console.error('📋 Error details:', JSON.stringify(errorLog, null, 2));
  }

  // Determine error status and message
  let status = 500;
  let message = "Error interno del servidor";
  let code = 'INTERNAL_SERVER_ERROR';

  if (error && typeof error === 'object') {
    const appError = error as unknown as Record<string, unknown>;
    
    if (appError.status && typeof appError.status === 'number') {
      status = appError.status;
    }
    
    if (appError.message && typeof appError.message === 'string') {
      message = appError.message;
    }
    
    if (appError.code && typeof appError.code === 'string') {
      code = appError.code;
    }
  }
  
  return c.json({
    error: message,
    code,
    timestamp: new Date().toISOString(),
    // Only include stack trace in development
    ...(config.name === 'development' && { stack: error instanceof Error ? error.stack : undefined })
  }, status);
});

// ===== SERVER CONFIGURATION =====
const port = parseInt(Deno.env.get("PORT") || "3030");

console.log(`🚀 PedidoList API starting on http://localhost:${port}`);
console.log(`📖 Health check: http://localhost:${port}/health`);
console.log(`🔒 Security: Auth middleware enabled for protected routes`);
console.log(`🌍 CORS origins: ${config.cors.origins.join(', ')}`);

Deno.serve({ port }, app.fetch); 