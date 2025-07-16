import { Hono } from "hono";
import { getSupabaseClient, getUserFromToken, getBusinessContext } from "../utils/supabase.ts";
import { ConflictResolver, syncAllPendingOrders } from "../utils/conflictResolution.ts";
import type { CreateOrderRequest as _CreateOrderRequest, UpdateOrderRequest as _UpdateOrderRequest } from "../types/index.ts";
import { createOrderSchema, updateOrderSchema, syncOrdersSchema } from "../utils/validation.ts";
import { validateRequest, getValidatedData } from "../middleware/validation.ts";
import { ordersSyncRateLimiter } from "../utils/rateLimiter.ts";

const orders = new Hono();

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

// Get orders for today
orders.get("/today", authMiddleware, async (c) => {
  const context = c.get("context") as RequestContext["context"];
  const today = new Date().toISOString().split('T')[0];
  const supabase = getSupabaseClient();

  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      *,
      items:order_items(*)
    `)
    .eq('business_id', context.business.id)
    .eq('delivery_date', today)
    .order('created_at', { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ orders });
});

// Get orders by date range
orders.get("/by-date", authMiddleware, async (c) => {
  const context = c.get("context") as RequestContext["context"];
  const startDate = c.req.query("start");
  const endDate = c.req.query("end");
  const supabase = getSupabaseClient();

  if (!startDate || !endDate) {
    return c.json({ error: "Start and end dates are required" }, 400);
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      *,
      items:order_items(*)
    `)
    .eq('business_id', context.business.id)
    .gte('delivery_date', startDate)
    .lte('delivery_date', endDate)
    .order('delivery_date', { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ orders });
});

// Create new order
orders.post("/", authMiddleware, validateRequest(createOrderSchema), async (c) => {
  const user = c.get("user") as RequestContext["user"];
  const context = c.get("context") as RequestContext["context"];
  const orderData = getValidatedData<typeof createOrderSchema._type>(c);
  const supabase = getSupabaseClient();

  // Calculate total
  const total = orderData.items.reduce((sum, item) => 
    sum + (item.quantity * item.unit_price), 0
  );

  // Get default branch for the business
  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .select('id')
    .eq('business_id', context.business.id)
    .eq('is_active', true)
    .single();

  if (branchError || !branch) {
    return c.json({ error: "No active branch found" }, 400);
  }

  // Create order with transaction
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      business_id: context.business.id,
      branch_id: branch.id,
      employee_id: context.employee.id,
      client_name: orderData.client_name,
      client_phone: orderData.client_phone,
      total,
      delivery_date: orderData.delivery_date,
      delivery_time: orderData.delivery_time,
      notes: orderData.notes,
      modified_by: user.id
    })
    .select()
    .single();

  if (orderError) {
    return c.json({ error: orderError.message }, 500);
  }

  // Create order items
  const orderItems = orderData.items.map(item => ({
    order_id: order.id,
    product_id: item.product_id,
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    subtotal: item.quantity * item.unit_price,
    notes: item.notes
  }));

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems);

  if (itemsError) {
    // Rollback order creation
    await supabase.from('orders').delete().eq('id', order.id);
    return c.json({ error: itemsError.message }, 500);
  }

  // Get complete order with items
  const { data: completeOrder, error: fetchError } = await supabase
    .from('orders')
    .select(`
      *,
      items:order_items(*)
    `)
    .eq('id', order.id)
    .single();

  if (fetchError) {
    return c.json({ error: fetchError.message }, 500);
  }

  // 🚨 NUEVA: Notificar automáticamente a los dueños del negocio
  try {
    const currentUrl = new URL(c.req.url);
    await fetch(`${currentUrl.origin}/api/notifications/new-order`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': c.req.header('Authorization') || '',
        },
        body: JSON.stringify({ 
          orderId: completeOrder.id,
          businessId: context.business.id 
        })
    });
  } catch (notifyError) {
      // No fallar si la notificación falla, solo loggear en el servidor
      const errorMessage = notifyError instanceof Error ? notifyError.message : "Unknown notification error";
      console.error("Failed to send new order notification:", errorMessage);
  }

  return c.json({ order: completeOrder }, 201);
});

// Update order status
orders.patch("/:id", authMiddleware, validateRequest(updateOrderSchema), async (c) => {
  const user = c.get("user") as RequestContext["user"];
  const orderId = c.req.param("id");
  const updateData = getValidatedData<typeof updateOrderSchema._type>(c);
  const supabase = getSupabaseClient();

  const { data: order, error } = await supabase
    .from('orders')
    .update({
      ...updateData,
      modified_by: user.id
    })
    .eq('id', orderId)
    .select(`
      *,
      items:order_items(*)
    `)
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ order });
});

// Sync offline orders with conflict resolution
orders.post("/sync", authMiddleware, ordersSyncRateLimiter(), validateRequest(syncOrdersSchema), async (c) => {
  const user = c.get("user") as RequestContext["user"];
  const { orders: offlineOrders } = getValidatedData<typeof syncOrdersSchema._type>(c);
  
  try {
    // Usar el sistema de resolución de conflictos
    const result = await syncAllPendingOrders(offlineOrders, user.id as string);
    
    return c.json({
      synced: result.synced,
      errors: result.errors,
      conflicts: result.conflicts,
      message: `Sincronización completada. ${result.synced.length} órdenes sincronizadas, ${result.errors.length} errores.`
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error en sincronización";
    return c.json({ 
      error: errorMessage,
      synced: [],
      errors: [],
      conflicts: []
    }, 500);
  }
});

// Nueva ruta para resolver conflictos específicos
orders.post("/resolve-conflict/:orderId", authMiddleware, async (c) => {
  const user = c.get("user") as RequestContext["user"];
  const orderId = c.req.param("orderId");
  const { localOrder, serverOrder } = await c.req.json();
  
  try {
    const resolution = await ConflictResolver.resolveOrderConflict(localOrder, serverOrder);
    await ConflictResolver.applyResolution(orderId, resolution, user.id as string);
    
    return c.json({
      success: true,
      resolution,
      message: "Conflicto resuelto exitosamente"
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error resolviendo conflicto";
    return c.json({ 
      error: errorMessage,
      success: false
    }, 500);
  }
});

// Ruta para obtener historial de resoluciones de conflictos
orders.get("/conflict-history", authMiddleware, async (c) => {
  const context = c.get("context") as RequestContext["context"];
  const supabase = getSupabaseClient();
  
  try {
    const { data: conflicts, error } = await supabase
      .from('conflict_resolutions')
      .select(`
        *,
        order:orders(client_name, client_phone, delivery_date)
      `)
      .eq('order.business_id', context.business.id)
      .order('resolved_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    
    return c.json({ conflicts });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error obteniendo historial";
    return c.json({ error: errorMessage }, 500);
  }
});

// Ruta para obtener estadísticas de conflictos
orders.get("/conflict-stats", authMiddleware, async (c) => {
  const context = c.get("context") as RequestContext["context"];
  const supabase = getSupabaseClient();
  
  try {
    const { data: stats, error } = await supabase
      .rpc('get_conflict_stats', { business_uuid: context.business.id });

    if (error) throw error;
    
    return c.json({ stats: stats[0] || {
      total_conflicts: 0,
      local_wins: 0,
      server_wins: 0,
      merge_required: 0,
      avg_resolution_time: null
    }});
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error obteniendo estadísticas";
    return c.json({ error: errorMessage }, 500);
  }
});

export default orders; 