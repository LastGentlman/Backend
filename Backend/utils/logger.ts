import { Context, Next } from "hono";

export async function requestLogger(c: Context, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const url = c.req.url;
  const userAgent = c.req.header("user-agent") || "unknown";
  const ip = c.req.header("x-forwarded-for") || 
             c.req.header("x-real-ip") || 
             "unknown";
  
  console.log(`📥 ${method} ${url} - ${ip} - ${userAgent}`);
  
  await next();
  
  const duration = Date.now() - start;
  const status = c.res.status;
  
  // Color coding para diferentes tipos de respuesta
  const statusColor = status >= 500 ? "🔴" : 
                     status >= 400 ? "🟡" : 
                     status >= 300 ? "🔵" : "🟢";
  
  console.log(`${statusColor} ${method} ${url} - ${status} - ${duration}ms`);
}

// Middleware para logging de errores específicos
export function errorLogger(error: any, context?: string) {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  
  console.error(`❌ [${timestamp}] ${context || 'Unknown'}: ${errorMessage}`);
  if (stack) {
    console.error(`Stack trace: ${stack}`);
  }
} 