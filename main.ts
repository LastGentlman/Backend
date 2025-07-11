import { Hono } from "hono";
import { cors } from "hono/cors";
import { load } from "https://deno.land/std@0.220.1/dotenv/mod.ts";
import { validateEnvironmentVariables, getEnvironmentConfig } from "./utils/config.ts";
import { getSupabaseClient as _getSupabaseClient } from "./utils/supabase.ts";
import { authMiddleware } from "./middleware/auth.ts";

// Importar rutas
import testRoutes from "./routes/test.ts";
import ordersRoutes from "./routes/orders.ts";
import businessRoutes from "./routes/business.ts";
import authRoutes from "./routes/auth.ts";
import notificationsRoutes from "./routes/notifications.ts";
import whatsappRoutes from "./routes/whatsapp.ts";
import k6Routes from "./routes/k6.ts";

// ===== LOAD ENVIRONMENT VARIABLES =====
// Load .env file if it exists (for local development)
try {
  await load({ export: true });
} catch {
  // .env file doesn't exist, that's okay
}

// Add at the top of your main.ts
export const CONFIG = {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
  SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  IS_PRODUCTION: Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined,
  PORT: parseInt(Deno.env.get("PORT") || "8000"),
};

// Validate production environment
if (CONFIG.IS_PRODUCTION) {
  const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter(key => !CONFIG[key as keyof typeof CONFIG]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

console.log("✅ Environment variables loaded");

// ===== VALIDACIÓN INICIAL =====
// Only validate environment variables in development (not in deployment)
if (!CONFIG.IS_PRODUCTION) {
  validateEnvironmentVariables();
}

const config = getEnvironmentConfig();

// ===== SUPABASE CLIENT (Lazy Loading) =====
// Supabase client will be initialized on first use
console.log("✅ Supabase client ready (lazy loading)");

// ===== INICIALIZACIÓN DE LA APP =====
const isDev = config.name === 'development';
const logPrefix = isDev ? '🚀' : 'STARTUP:';
console.log(`${logPrefix} Iniciando PedidoList API en modo: ${config.name}`);
console.log(`${isDev ? '🔒' : 'SECURITY:'} Seguridad CORS: ${config.security.strictCORS ? 'estricta' : 'permisiva'}`);
console.log(`${isDev ? '📊' : 'CONFIG:'} Rate limiting: ${config.rateLimiting.enabled ? 'habilitado' : 'deshabilitado'}`);

const app = new Hono();

// ===== MIDDLEWARES GLOBALES (ORDEN CRÍTICO) =====

// 1. Pretty JSON middleware (solo en desarrollo)
if (config.name !== 'production') {
  app.use("*", async (c, next) => {
    await next();
    // Solo para respuestas exitosas y JSON
    if (
      c.res &&
      c.res.headers.get("content-type")?.includes("application/json") &&
      c.res.status < 400
    ) {
      try {
        const body = await c.res.json();
        c.res = new Response(JSON.stringify(body, null, 2), {
          headers: c.res.headers,
          status: c.res.status,
        });
      } catch {
        // Ignorar si no es JSON parseable
      }
    }
  });
  console.log(`${isDev ? '📝' : 'JSON:'} Pretty JSON enabled for development`);
} else {
  console.log(`${isDev ? '📝' : 'JSON:'} Pretty JSON disabled for production (optimized responses)`);
}

// 2. CORS configurado correctamente por ambiente
app.use("*", cors({
  origin: config.cors.origins, // ✅ FIJO: Orígenes específicos por ambiente
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600, // Cache preflight por 10 minutos
}));

// 3. Logging middleware personalizado
app.use("*", async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  
  // Solo loggear en desarrollo y staging
  if (config.logging.detailed) {
    const emoji = isDev ? '➡️' : '';
    console.log(`${emoji} ${method} ${path}`);
  }
  
  await next();
  
  const duration = Date.now() - start;
  const status = c.res.status;
  
  // Color coding para status
  const statusEmoji = isDev ? (status >= 400 ? '🔴' : status >= 300 ? '🟡' : '🟢') : '';
  const statusText = status >= 400 ? 'ERROR' : status >= 300 ? 'REDIRECT' : 'SUCCESS';
  
  if (config.logging.detailed) {
    const logMessage = isDev 
      ? `⬅️ ${statusEmoji} ${status} ${method} ${path} - ${duration}ms`
      : `${statusText} ${status} ${method} ${path} - ${duration}ms`;
    console.log(logMessage);
  }
});

// ===== HEALTH CHECK (antes de rutas protegidas) =====
app.get("/health", async (c) => {
  try {
    const { getSupabaseClient } = await import("./utils/supabase.ts");
    const supabase = getSupabaseClient();
    
    // Test básico de conectividad
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

// ===== RUTAS PÚBLICAS (sin autenticación) =====
app.route("/api/auth", authRoutes);
app.route("/api/whatsapp", whatsappRoutes);
app.route("/api/k6", k6Routes);

// ===== MIDDLEWARE DE AUTENTICACIÓN =====
// ✅ FIJO: Aplicar middleware ANTES de registrar rutas protegidas
app.use("/api/orders/*", authMiddleware);
app.use("/api/business/*", authMiddleware);
app.use("/api/test/*", authMiddleware);
app.use("/api/notifications/*", authMiddleware);

// ===== RUTAS PROTEGIDAS (requieren autenticación) =====
app.route("/api/test", testRoutes);
app.route("/api/orders", ordersRoutes);
app.route("/api/business", businessRoutes);
app.route("/api/notifications", notificationsRoutes);

// ===== MANEJO DE RUTAS NO ENCONTRADAS =====
app.notFound((c) => {
  const logMessage = isDev ? `❌ 404: ${c.req.method} ${c.req.path}` : `404: ${c.req.method} ${c.req.path}`;
  console.log(logMessage);
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
      "POST /api/notifications/subscribe"
    ]
  }, 404);
});

// ===== ERROR HANDLER GLOBAL (debe ir AL FINAL) =====
// ✅ FIJO: Mover error handler al final para capturar todos los errores
app.onError((error, c) => {
  const errorPrefix = isDev ? '🚨' : 'ERROR:';
  console.error(`${errorPrefix} Unhandled error:`, error);
  
  // Log detallado del error
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
    const detailPrefix = isDev ? '📋' : 'DETAILS:';
    console.error(`${detailPrefix} Error details:`, JSON.stringify(errorLog, null, 2));
  }

  // Determinar status y mensaje del error
  let status = 500;
  let message = "Error interno del servidor";
  let code = 'INTERNAL_SERVER_ERROR';

  type AppError = { status?: number; message?: string; code?: string };
  const appError = error as AppError;
  
  if (appError.status && typeof appError.status === 'number') {
    status = appError.status;
  }
  
  if (appError.message && typeof appError.message === 'string') {
    message = appError.message;
  }
  
  if (appError.code && typeof appError.code === 'string') {
    code = appError.code;
  }
  
  return c.json({
    error: message,
    code,
    timestamp: new Date().toISOString(),
    // Solo incluir stack trace en desarrollo
    ...(config.name === 'development' && { stack: error instanceof Error ? error.stack : undefined })
  }, status);
});

// ===== CONFIGURACIÓN DEL SERVIDOR =====
const port = CONFIG.PORT;

console.log(`${isDev ? '🚀' : 'SERVER:'} PedidoList API running on http://localhost:${port}`);
console.log(`${isDev ? '📖' : 'HEALTH:'} Health check: http://localhost:${port}/health`);
console.log(`${isDev ? '🔒' : 'AUTH:'} Security: Auth middleware enabled for protected routes`);
console.log(`${isDev ? '🌍' : 'CORS:'} CORS origins: ${config.cors.origins.join(', ')}`);

Deno.serve({ port }, app.fetch); 