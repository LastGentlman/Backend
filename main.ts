import { Hono } from "hono";
import { cors } from "hono/cors";
import { load } from "https://deno.land/std@0.220.1/dotenv/mod.ts";
import { initializeSupabase } from "./utils/supabase.ts";
import { errorHandler } from "./utils/errorHandler.ts";
import { requestLogger } from "./utils/logger.ts";
import { smartRateLimiter } from "./utils/rateLimiter.ts";
import { getEnvironmentConfig, logEnvironmentConfig, validateEnvironmentVariables } from "./utils/config.ts";
import { securityHeadersMiddleware } from "./utils/security.ts";
import testRoutes from "./routes/test.ts";
import ordersRoutes from "./routes/orders.ts";
import authRoutes from "./routes/auth.ts";
import businessRoutes from "./routes/business.ts";  // 🆕 Rutas de negocios
import notificationsRoutes from "./routes/notifications.ts";
import { authMiddleware } from "./middleware/auth.ts";

// Load environment variables from .env file
const env = await load();
console.log("✅ Environment variables loaded");

// Set environment variables for Deno
for (const [key, value] of Object.entries(env)) {
  Deno.env.set(key, value);
}

// Get environment configuration
const config = getEnvironmentConfig();

// Validar variables de entorno críticas (siempre, no condicionalmente)
validateEnvironmentVariables();

console.log(`🌍 Environment: ${config.name}`);

// Log detailed configuration
logEnvironmentConfig();

// Initialize Supabase client after env vars are loaded
try {
  initializeSupabase();
  console.log("✅ Supabase client initialized");
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  console.error("❌ Failed to initialize Supabase:", errorMessage);
  throw error;
}

const app = new Hono();

// Global middlewares (se ejecutan en orden)
app.use("*", requestLogger); // Logging de todas las peticiones
app.use("*", smartRateLimiter()); // Rate limiting inteligente
app.use("*", securityHeadersMiddleware()); // Headers de seguridad

// Add CORS middleware with environment-specific origins
app.use("*", cors({
  origin: config.cors.origins,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

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

// Health check endpoint with database connectivity test
app.get("/health", async (c) => {
  try {
    // Verificar conexión a Supabase
    const { getSupabaseClient } = await import("./utils/supabase.ts");
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('profiles').select('count').limit(1);
    
    return c.json({
      status: "healthy",
      database: error ? "error" : "connected",
      timestamp: new Date().toISOString(),
      environment: config.name,
      rateLimiting: config.rateLimiting.enabled ? "enabled" : "disabled",
      security: config.security.strictCORS ? "strict" : "permissive"
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({
      status: "error",
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// ===== RUTAS PROTEGIDAS =====
// 🆕 Rutas de API que requieren autenticación (excluyendo auth)
app.use("/api/orders/*", authMiddleware);
app.use("/api/business/*", authMiddleware);
app.use("/api/test/*", authMiddleware);

// Add API routes with specific middlewares
app.route("/api/test", testRoutes);
app.route("/api/orders", ordersRoutes);
app.route("/api/business", businessRoutes);
app.route("/api/auth", authRoutes); // Auth routes are public (no middleware)
app.route("/api/notifications", notificationsRoutes);

// ===== ERROR HANDLER (debe ir después de las rutas) =====
app.use("*", errorHandler);

// ===== MANEJO DE RUTAS NO ENCONTRADAS =====
app.notFound((c) => {
  return c.json({ 
    error: "Endpoint no encontrado",
    path: c.req.path,
    method: c.req.method,
    timestamp: new Date().toISOString()
  }, 404);
});

// Get port from environment variable or default to 3030
const port = parseInt(Deno.env.get("PORT") || "3030");

// Start the server
console.log(`🚀 PedidoList API starting on http://localhost:${port}`);
console.log(`🔒 Security: Auth middleware enabled`);
Deno.serve({ port }, app.fetch); 