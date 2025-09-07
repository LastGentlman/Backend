// @ts-nocheck
import { Hono } from "hono";
import { getSupabaseClient, getUserFromToken, getBusinessContext } from "../utils/supabase.ts";
import { logXSSAttempt } from "../utils/security.ts";

const dashboard = new Hono();

// Define context type
interface RequestContext {
  user: Record<string, unknown>;
  context: {
    employee: Record<string, unknown>;
    business: Record<string, unknown>;
    isOwner: boolean;
  };
}

// Extend Hono's context to include our custom properties
declare module "hono" {
  interface ContextVariableMap {
    user: Record<string, unknown>;
    context: {
      employee: Record<string, unknown>;
      business: Record<string, unknown>;
      isOwner: boolean;
    };
  }
}

// Middleware to authenticate requests
async function authMiddleware(c: { req: { header: (name: string) => string | undefined }; set: (key: string, value: unknown) => void; json: (data: unknown, status?: number) => Response }, next: () => Promise<void>) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.substring(7);
  try {
    const user = await getUserFromToken(token);
    const context = await getBusinessContext(user.id);
    c.set("user", user);
    c.set("context", context);
    await next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Authentication failed";
    return c.json({ error: errorMessage }, 401);
  }
}

// Get dashboard statistics for a business
dashboard.get("/stats/:businessId", authMiddleware, async (c) => {
  try {
    const businessId = c.req.param("businessId");
    const context = c.get("context") as RequestContext["context"];
    const supabase = getSupabaseClient();

    // Security: Ensure user can only access their business stats
    if (!context.business || context.business.id !== businessId) {
      logXSSAttempt(
        `Unauthorized access attempt to business ${businessId}`,
        'dashboard_api',
        'GET_stats',
        c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
        c.req.header('user-agent')
      );
      return c.json({ 
        error: "Acceso no autorizado",
        code: "UNAUTHORIZED_BUSINESS_ACCESS"
      }, 403);
    }

    // ✅ SIMPLIFIED VERSION: Return mock data to prevent 500 errors
    // This prevents the infinite loop while we debug the database issues
    console.log(`📊 Dashboard stats requested for business: ${businessId}`);
    
    return c.json({
      stats: {
        today: {
          total: 0,
          pending: 0,
          preparing: 0,
          ready: 0,
          delivered: 0,
          cancelled: 0,
          totalAmount: 0
        },
        thisMonth: {
          total: 0,
          totalAmount: 0,
          avgOrderValue: 0
        },
        lastMonth: {
          total: 0,
          totalAmount: 0
        },
        growth: {
          orders: 0,
          revenue: 0
        },
        totals: {
          products: 0,
          clients: 0
        }
      },
      timestamp: new Date().toISOString(),
      note: "Mock data - database queries temporarily disabled to prevent 500 errors"
    });

  } catch (error) {
    console.error('Unexpected error in GET /dashboard/stats/:businessId:', error);
    return c.json({ 
      error: "Error interno del servidor",
      details: error instanceof Error ? error.message : "Error desconocido"
    }, 500);
  }
});

export default dashboard; 