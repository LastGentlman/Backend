import { Hono } from "hono";
import * as webpush from "@negrel/webpush";
import { getSupabaseClient } from "../utils/supabase.ts";
import { authMiddleware } from "../middleware/auth.ts";
import type { User } from "@supabase/supabase-js";

// Fuller definition for a push subscription
interface PushSubscription {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}

// Richer notification payload based on the Push API standard
interface NotificationPayload {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    data?: any;
    actions?: Array<{
        action: string;
        title: string;
        icon?: string;
    }>;
}

type HonoVariables = {
  user: User;
};

const notifications = new Hono<{ Variables: HonoVariables }>();

let applicationServer: webpush.ApplicationServer | undefined;

// Memoized function to get the VAPID application server
async function getApplicationServer() {
    if (applicationServer) {
        return applicationServer;
    }

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidContactEmail = Deno.env.get("VAPID_CONTACT_EMAIL");

    if (!vapidPublicKey || !vapidPrivateKey || !vapidContactEmail) {
        throw new Error("VAPID keys and contact email must be configured in environment variables.");
    }

    const exportedVapidKeys: webpush.ExportedVapidKeys = {
        publicKey: JSON.parse(vapidPublicKey),
        privateKey: JSON.parse(vapidPrivateKey),
    };

    const vapidKeys = await webpush.importVapidKeys(exportedVapidKeys);

    applicationServer = await webpush.ApplicationServer.new({
        contactInformation: `mailto:${vapidContactEmail}`,
        vapidKeys: vapidKeys,
    });

    return applicationServer;
}

// All notification routes require a valid user
notifications.use("/*", authMiddleware);

// Subscribe a user's device, optionally linking it to a business
notifications.post("/subscribe", async (c) => {
    const user = c.get("user");
    const { subscription, businessId } = await c.req.json<{
        subscription: PushSubscription;
        businessId?: string;
    }>();

    if (!subscription || !subscription.endpoint) {
        return c.json({ error: "Invalid subscription object" }, 400);
    }

    try {
        const supabase = getSupabaseClient();
        
        // If a businessId is provided, verify the user is an active employee
        if (businessId) {
            const { data: employee, error: employeeError } = await supabase
                .from("employees")
                .select("role")
                .eq("business_id", businessId)
                .eq("user_id", user.id)
                .eq("is_active", true)
                .maybeSingle(); // Use maybeSingle to avoid error if no row is found

            if (employeeError || !employee) {
                return c.json({ error: "User not authorized for this business" }, 403);
            }
        }

        const { error } = await supabase
            .from("push_subscriptions")
            .upsert({
                endpoint: subscription.endpoint, // Primary key
                user_id: user.id,
                business_id: businessId,
                p256dh_key: subscription.keys.p256dh,
                auth_key: subscription.keys.auth,
                updated_at: new Date().toISOString(),
                is_active: true // Re-activate subscription on new subscribe
            }, { onConflict: 'endpoint' });


        if (error) {
            console.error("Error saving subscription:", error);
            return c.json({ error: "Failed to save subscription" }, 500);
        }

        return c.json({ success: true }, 201);
    } catch (err) {
        console.error("Subscription error:", err);
        return c.json({ error: "An unexpected error occurred" }, 500);
    }
});

// Send a notification to all owners and admins of a specific business
notifications.post("/notify-business-owners", async (c) => {
    const { businessId, payload } = await c.req.json<{
        businessId: string;
        payload: NotificationPayload;
    }>();

    if (!businessId || !payload.title || !payload.body) {
        return c.json({ error: "Missing businessId or notification payload" }, 400);
    }

    try {
        const supabase = getSupabaseClient();
        
        // Get active subscriptions for owners and admins of the business
        const { data: ownerSubscriptions, error } = await supabase
            .from("employees")
            .select(`
                push_subscriptions(endpoint, p256dh_key, auth_key)
            `)
            .eq("business_id", businessId)
            .in("role", ["owner", "admin"])
            .eq('push_subscriptions.is_active', true);

        if (error) {
            console.error("Error fetching owner subscriptions:", error);
            return c.json({ error: "Failed to fetch subscriptions" }, 500);
        }

        const validSubscriptions = ownerSubscriptions
            .map(e => e.push_subscriptions)
            .flat()
            .filter(sub => sub.endpoint);

        if (!validSubscriptions.length) {
            return c.json({ message: "No active subscriptions found for business owners" }, 200);
        }

        const notificationPayload = JSON.stringify(payload);
        const payloadBuffer = new TextEncoder().encode(notificationPayload).buffer as ArrayBuffer;
        const appServer = await getApplicationServer();

        let successCount = 0;
        let failureCount = 0;

        for (const sub of validSubscriptions) {
            const subscription = {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
            };

            const subscriber = appServer.subscribe(subscription as any);
            
            try {
                await subscriber.pushMessage(payloadBuffer, {});
                successCount++;
            } catch (err) {
                failureCount++;
                const errorMessage = err instanceof Error ? err.message : "Unknown error";
                console.error(`Failed to send notification to ${subscription.endpoint}:`, errorMessage);
                
                if (err instanceof webpush.PushMessageError && err.isGone()) {
                    console.log("Subscription expired, marking as inactive:", subscription.endpoint);
                    await supabase
                        .from("push_subscriptions")
                        .update({ is_active: false })
                        .eq("endpoint", subscription.endpoint);
                }
            }
        }

        return c.json({ 
            success: true, 
            sent: successCount, 
            failed: failureCount,
            total: validSubscriptions.length 
        });

    } catch (err) {
        console.error("Notify business owners error:", err);
        return c.json({ error: "An unexpected error occurred" }, 500);
    }
});

// Trigger a notification for a new order, to be called internally
notifications.post("/new-order", async (c) => {
    const { orderId, businessId } = await c.req.json<{ orderId: string, businessId: string }>();

    if (!orderId || !businessId) {
        return c.json({ error: "Missing orderId or businessId" }, 400);
    }

    try {
        const supabase = getSupabaseClient();
        
        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select(`*, businesses(name)`)
            .eq("id", orderId)
            .single();

        if (orderError || !order) {
            console.error("Error fetching order:", orderError);
            return c.json({ error: "Order not found" }, 404);
        }

        const payload: NotificationPayload = {
            title: `🔔 Nuevo Pedido #${order.folio || ''}`,
            body: `${order.client_name} - Total: $${order.total}`,
            data: { url: `/orders/${order.id}` },
            actions: [{ action: 'view', title: 'Ver Pedido' }]
        };

        const currentUrl = new URL(c.req.url);
        const notifyUrl = `${currentUrl.origin}/api/notifications/notify-business-owners`;

        const notifyResponse = await fetch(notifyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': c.req.header('Authorization') || '',
            },
            body: JSON.stringify({ businessId: businessId, payload })
        });
        
        const result = await notifyResponse.json();
        
        await supabase.from("notification_logs").insert({
            order_id: orderId,
            business_id: businessId,
            notification_type: 'new_order',
            recipients_count: result.sent || 0,
            payload: payload
        });

        return c.json(result);

    } catch (err) {
        console.error("New order notification error:", err);
        return c.json({ error: "An unexpected error occurred" }, 500);
    }
});

// Provides the VAPID public key to the client application
notifications.get("/vapid-key", (c) => {
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    if (!vapidPublicKey) {
      return c.json({ error: "VAPID public key not configured" }, 500);
    }
    return c.json({ publicKey: JSON.parse(vapidPublicKey) });
});

export default notifications; 