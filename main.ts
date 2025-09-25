import { Hono } from "hono";
import { cors } from "hono/cors";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

// Import types first
import { 
  AppConfig, 
  UserContext, 
  BusinessContext, 
  HealthResponse,
  ErrorResponse,
  ErrorCode,
  isAppError
} from "./types/app.ts";

// Then import utilities
import { validateEnvironmentVariables, getEnvironmentConfig } from "./utils/config.ts";
import { getSupabaseClient } from "./utils/supabase.ts";
import { authMiddleware } from "./middleware/auth.ts";
import { csrfProtection } from "./utils/csrf.ts";
import { securityHeadersMiddleware } from "./utils/security.ts";
import { createValidatedConfig } from "./utils/env-validation.ts";

// Importar rutas
import testRoutes from "./routes/test.ts";
import ordersRoutes from "./routes/orders.ts";
import businessRoutes from "./routes/business.ts";
import authRoutes from "./routes/auth.ts";
import notificationsRoutes from "./routes/notifications.ts";
import whatsappRoutes from "./routes/whatsapp.ts";
import k6Routes from "./routes/k6.ts";
import monitoringRoutes from "./routes/monitoring.ts";
import productsRoutes from "./routes/products.ts";
import clientsRoutes from "./routes/clients.ts";
import backupRoutes from "./routes/backup.ts";
import accountRecoveryRoutes from "./routes/account-recovery.ts";

// ===== CARGA DE VARIABLES DE ENTORNO =====
// ✅ MEJOR PRÁCTICA: Manejo de errores más específico
try {
  await load({ export: true });
  console.log("✅ Environment file loaded");
} catch (error) {
  // Solo log en desarrollo, no error crítico
  if (Deno.env.get("NODE_ENV") === "development") {
    console.log("ℹ️ No .env file found (normal in production)");
  }
}

// ✅ MEJOR PRÁCTICA: Configuración con validación centralizada
export const CONFIG: AppConfig = createValidatedConfig();

console.log("✅ Environment variables validated");

// ===== VALIDACIÓN INICIAL =====
// ✅ MEJOR PRÁCTICA: Solo validar en desarrollo
if (!CONFIG.IS_PRODUCTION) {
  try {
    validateEnvironmentVariables();
    console.log("✅ Development environment validated");
  } catch (error) {
    console.error("❌ Environment validation failed:", error);
    // En desarrollo, podemos continuar con advertencias
  }
}

const config = getEnvironmentConfig();

// ===== INICIALIZACIÓN LAZY DE SUPABASE =====
console.log("✅ Supabase client ready (lazy loading)");
console.log("✅ CSRF tokens will be stored in Supabase");

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
    
    const contentType = c.res.headers.get("content-type");
    const isJson = contentType?.includes("application/json") ?? false;
    const isSuccess = c.res.status < 400;
    
    if (c.res && isJson && isSuccess) {
      try {
        const body = await c.res.json();
        c.res = new Response(JSON.stringify(body, null, 2), {
          headers: c.res.headers,
          status: c.res.status,
        });
      } catch (parseError) {
        console.warn("Failed to parse JSON for pretty printing:", parseError);
      }
    }
  });
  console.log(`${isDev ? '📝' : 'JSON:'} Pretty JSON enabled for development`);
} else {
  console.log(`${isDev ? '📝' : 'JSON:'} Pretty JSON disabled for production`);
}

// 2. CORS configurado por ambiente
app.use("*", cors({
  origin: config.cors.origins,
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Session-ID', 'X-CSRF-Token'],
  exposeHeaders: ['Content-Length', 'X-CSRF-Token'],
  maxAge: 600,
}));

// 3. Logging middleware con tipos específicos
app.use("*", async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  
  if (config.logging.detailed) {
    const emoji = isDev ? '➡️' : '';
    console.log(`${emoji} ${method} ${path}`);
  }
  
  await next();
  
  const duration = Date.now() - start;
  const status = c.res.status;
  
  const statusEmoji = isDev ? (status >= 400 ? '🔴' : status >= 300 ? '🟡' : '🟢') : '';
  const statusText = status >= 400 ? 'ERROR' : status >= 300 ? 'REDIRECT' : 'SUCCESS';
  
  if (config.logging.detailed) {
    const logMessage = isDev 
      ? `⬅️ ${statusEmoji} ${status} ${method} ${path} - ${duration}ms`
      : `${statusText} ${status} ${method} ${path} - ${duration}ms`;
    console.log(logMessage);
  }
});

// 4. Middleware de headers de seguridad
app.use("*", securityHeadersMiddleware(CONFIG.IS_PRODUCTION));

// 5. Middleware CSRF se aplicará después de autenticación

// ===== HEALTH CHECK =====
app.get("/health", async (c) => {
  try {
    const supabase = getSupabaseClient();
    
    // Test básico de conectividad con manejo de errores
    const { error } = await supabase.from('profiles').select('count').limit(1);
    
    const healthData: HealthResponse = {
      status: "healthy",
      database: error ? "error" : "connected",
      timestamp: new Date().toISOString(),
      environment: config.name,
      rateLimiting: config.rateLimiting.enabled ? "enabled" : "disabled",
      security: config.security.strictCORS ? "strict" : "permissive",
      version: "1.0.0"
    };

    return c.json(healthData);
  } catch (error) {
    console.error("❌ Health check failed:", error);
    
    const errorData: HealthResponse = {
      status: "error",
      database: "error",
      timestamp: new Date().toISOString(),
      environment: config.name,
      rateLimiting: config.rateLimiting.enabled ? "enabled" : "disabled",
      security: config.security.strictCORS ? "strict" : "permissive",
      version: "1.0.0"
    };
    
    return c.json(errorData, 500);
  }
});

// ===== RUTAS PÚBLICAS =====
app.route("/api/auth", authRoutes);
app.route("/api/auth", accountRecoveryRoutes);
app.route("/api/whatsapp", whatsappRoutes);
app.route("/api/k6", k6Routes);
app.route("/api/monitoring", monitoringRoutes);

// ===== MIDDLEWARE DE AUTENTICACIÓN PARA RUTAS PROTEGIDAS =====
const protectedRoutes = [
  "/api/orders/*",
  "/api/business/*",
  "/api/products/*",
  "/api/clients/*",
  "/api/test/*",
  "/api/notifications/*",
  "/api/backup/*"
] as const;

// Aplicar autenticación
protectedRoutes.forEach(route => {
  app.use(route, authMiddleware);
});

// Aplicar CSRF a rutas que modifican datos
protectedRoutes.forEach(route => {
  app.use(route, csrfProtection());
});

// ===== RUTAS PROTEGIDAS =====
app.route("/api/test", testRoutes);
app.route("/api/orders", ordersRoutes);
app.route("/api/business", businessRoutes);
app.route("/api/products", productsRoutes);
app.route("/api/clients", clientsRoutes);
app.route("/api/backup", backupRoutes);
app.route("/api/notifications", notificationsRoutes);

// ===== MANEJO DE RUTAS NO ENCONTRADAS =====
app.notFound((c) => {
  const logMessage = isDev 
    ? `❌ 404: ${c.req.method} ${c.req.path}` 
    : `404: ${c.req.method} ${c.req.path}`;
  console.log(logMessage);
  
  const notFoundData = {
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
  };
  
  return c.json(notFoundData, 404);
});

// ===== ERROR HANDLER GLOBAL =====
app.onError((error: unknown, c) => {
  const errorPrefix = isDev ? '🚨' : 'ERROR:';
  console.error(`${errorPrefix} Unhandled error:`, error);
  
  // Extraer contexto con tipos seguros
  const user = c.get('user') as unknown as UserContext | undefined;
  const context = c.get('context') as unknown as { business?: BusinessContext } | undefined;
  const business = context?.business;
  
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

  // Determinar status y mensaje con tipos específicos
  let status = 500;
  let message = "Error interno del servidor";
  let code: ErrorCode = 'INTERNAL_SERVER_ERROR';

  if (isAppError(error)) {
    status = error.status;
    message = error.message;
    code = error.code;
  } else if (error instanceof Error) {
    // Mantener mensaje del error pero status 500
    message = error.message;
  }
  
  const errorResponse: ErrorResponse = {
    error: message,
    code,
    timestamp: new Date().toISOString(),
    // Solo incluir stack trace en desarrollo
    ...(config.name === 'development' && error instanceof Error && error.stack && { 
      stack: error.stack
    })
  };
  
  return c.json(errorResponse, status as 200 | 400 | 401 | 403 | 404 | 500);
});

// ===== CONFIGURACIÓN DEL SERVIDOR =====
const port = CONFIG.PORT;

console.log(`${isDev ? '🚀' : 'SERVER:'} PedidoList API running on http://localhost:${port}`);
console.log(`${isDev ? '📖' : 'HEALTH:'} Health check: http://localhost:${port}/health`);
console.log(`${isDev ? '🔒' : 'AUTH:'} Security: Auth middleware enabled for protected routes`);
console.log(`${isDev ? '🌍' : 'CORS:'} CORS origins: ${config.cors.origins.join(', ')}`);

Deno.serve({ port }, app.fetch); 