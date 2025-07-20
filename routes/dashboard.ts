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

    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0, 7);
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthStr = lastMonth.toISOString().slice(0, 7);

    // Get today's orders
    const { data: todayOrders, error: todayError } = await supabase
      .from('orders')
      .select('*')
      .eq('business_id', businessId)
      .eq('delivery_date', today);

    if (todayError) {
      console.error('Error fetching today orders:', todayError);
      return c.json({ 
        error: "Error al obtener pedidos de hoy",
        details: todayError.message 
      }, 500);
    }

    // Get this month's orders
    const { data: monthOrders, error: monthError } = await supabase
      .from('orders')
      .select('*')
      .eq('business_id', businessId)
      .gte('delivery_date', `${thisMonth}-01`)
      .lte('delivery_date', `${thisMonth}-31`);

    if (monthError) {
      console.error('Error fetching month orders:', monthError);
      return c.json({ 
        error: "Error al obtener pedidos del mes",
        details: monthError.message 
      }, 500);
    }

    // Get last month's orders for comparison
    const { data: lastMonthOrders, error: lastMonthError } = await supabase
      .from('orders')
      .select('*')
      .eq('business_id', businessId)
      .gte('delivery_date', `${lastMonthStr}-01`)
      .lte('delivery_date', `${lastMonthStr}-31`);

    if (lastMonthError) {
      console.error('Error fetching last month orders:', lastMonthError);
    }

    // Get total products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true);

    if (productsError) {
      console.error('Error fetching products:', productsError);
    }

    // Get total clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true);

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
    }

    // Calculate statistics
    const todayStats = {
      total: todayOrders?.length || 0,
      pending: todayOrders?.filter(o => o.status === 'pending').length || 0,
      preparing: todayOrders?.filter(o => o.status === 'preparing').length || 0,
      ready: todayOrders?.filter(o => o.status === 'ready').length || 0,
      delivered: todayOrders?.filter(o => o.status === 'delivered').length || 0,
      cancelled: todayOrders?.filter(o => o.status === 'cancelled').length || 0,
      totalAmount: todayOrders?.reduce((sum, order) => sum + parseFloat(order.total), 0) || 0
    };

    const monthStats = {
      total: monthOrders?.length || 0,
      totalAmount: monthOrders?.reduce((sum, order) => sum + parseFloat(order.total), 0) || 0,
      avgOrderValue: monthOrders?.length > 0 
        ? (monthOrders.reduce((sum, order) => sum + parseFloat(order.total), 0) / monthOrders.length)
        : 0
    };

    const lastMonthStats = {
      total: lastMonthOrders?.length || 0,
      totalAmount: lastMonthOrders?.reduce((sum, order) => sum + parseFloat(order.total), 0) || 0
    };

    // Calculate growth percentages
    const orderGrowth = lastMonthStats.total > 0 
      ? ((monthStats.total - lastMonthStats.total) / lastMonthStats.total) * 100
      : 0;

    const revenueGrowth = lastMonthStats.totalAmount > 0
      ? ((monthStats.totalAmount - lastMonthStats.totalAmount) / lastMonthStats.totalAmount) * 100
      : 0;

    return c.json({
      stats: {
        today: todayStats,
        thisMonth: monthStats,
        lastMonth: lastMonthStats,
        growth: {
          orders: Math.round(orderGrowth * 100) / 100,
          revenue: Math.round(revenueGrowth * 100) / 100
        },
        totals: {
          products: products?.length || 0,
          clients: clients?.length || 0
        }
      },
      timestamp: new Date().toISOString()
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