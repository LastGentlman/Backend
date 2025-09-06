import { Hono } from "hono";
import { z } from "zod";
import { getSupabaseClient } from "../utils/supabase.ts";
import { requireOwner, requireAdminOrOwner } from "../middleware/auth.ts";
import { getBusinessFromContext, getEmployeeFromContext, getUserFromContext } from "../types/context.ts";
import { emailNotificationService } from "../services/EmailNotificationService.ts";
import { getStripeClient } from "../utils/stripe.ts";
import { getTaxRegimeByCode, isValidTaxRegime as _isValidTaxRegime } from "../utils/taxRegimes.ts";
import { validateData, employeeInvitationSchema, trialActivationSchema, businessSettingsUpdateSchema } from "../utils/validation.ts";
import { getUserFromToken } from "../utils/supabase.ts";
import type { TrialActivationRequest as _TrialActivationRequest, TrialActivationResponse } from "../types/business.ts";
import type { Price as _Price } from "../types/stripe.ts";

const business = new Hono();
const supabase = getSupabaseClient();

// ===== ACTIVACIÓN DE TRIAL =====

// Activar trial gratuito y crear negocio
business.post("/activate-trial", async (c) => {
  try {
    // Obtener usuario del token
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Token de autorización requerido" }, 401);
    }

    const token = authHeader.substring(7);
    const { getUserFromToken } = await import("../utils/supabase.ts");
    const user = await getUserFromToken(token);
    
    if (!user) {
      return c.json({ error: "Usuario no encontrado" }, 401);
    }

    // Obtener datos del request
    const requestData = await c.req.json();
    
    // Validar datos con Zod schema
    const validation = validateData(trialActivationSchema, requestData);
    if (!validation.success) {
      return c.json({ 
        error: "Datos de entrada inválidos",
        details: validation.errors.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      }, 400);
    }
    
    const validatedData = validation.data;

    const taxRegime = getTaxRegimeByCode(validatedData.taxRegime);
    if (!taxRegime) {
      return c.json({ 
        error: "Régimen fiscal no encontrado" 
      }, 400);
    }

    const supabase = getSupabaseClient();
    const stripe = getStripeClient();

    // 1. Crear o obtener cliente en Stripe
    const stripeCustomer = await stripe.createOrGetCustomer(
      validatedData.businessEmail,
      validatedData.billingName,
      {
        userId: user.id,
        businessName: validatedData.businessName,
        taxId: validatedData.taxId || '',
      }
    );

    // 2. Procesar método de pago si se proporciona
    let paymentMethodId: string | undefined;
    if (validatedData.paymentMethod && validatedData.paymentMethod.card) {
      try {
        const paymentMethod = await stripe.createPaymentMethod(
          validatedData.paymentMethod.type,
          validatedData.paymentMethod.card
        );
        
        await stripe.attachPaymentMethodToCustomer(paymentMethod.id, stripeCustomer.id);
        paymentMethodId = paymentMethod.id;
      } catch (error) {
        console.error('Error processing payment method:', error);
        // No fallar si el método de pago falla (trial puede continuar)
      }
    }

    // 3. Crear trial gratuito (7 días base + 7 días adicionales si agrega método de pago)
    let subscription: { id: string; trial_end: number | null; status: string; current_period_end: number };
    const baseTrialDays = 7; // 7 días base sin método de pago
    const extendedTrialDays = paymentMethodId ? 14 : 7; // 7 días adicionales si agrega método de pago
    
    if (paymentMethodId) {
      // Si hay método de pago, crear suscripción mensual con trial extendido (14 días total)
      const priceId = await stripe.getPriceByLookupKey('price_monthly');
      subscription = await stripe.createSubscriptionWithTrial(
        stripeCustomer.id,
        priceId,
        extendedTrialDays,
        paymentMethodId
      );
    } else {
      // Si NO hay método de pago, crear trial gratuito base (7 días)
      const freeTrialPriceId = await stripe.getPriceByLookupKey('price_free_trial');
      subscription = await stripe.createFreeTrial(
        stripeCustomer.id,
        freeTrialPriceId,
        baseTrialDays
      );
    }

    // 4. Crear negocio en la base de datos
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .insert({
        name: validatedData.businessName,
        owner_id: user.id,
        email: validatedData.businessEmail,
        phone: validatedData.businessPhone || null,
        address: validatedData.businessAddress || null,
        stripe_customer_id: stripeCustomer.id,
        stripe_subscription_id: subscription.id,
        subscription_status: 'trial',
        trial_ends_at: new Date(subscription.trial_end! * 1000).toISOString(),
        settings: {
          currency: validatedData.currency,
          taxRegime: {
            code: taxRegime.code,
            name: taxRegime.name,
            type: taxRegime.type
          },
          notifications: {
            email: true,
            push: true
          },
          timezone: 'America/Mexico_City'
        },
        billing_info: {
          name: validatedData.billingName,
          taxId: validatedData.taxId,
          address: validatedData.billingAddress
        }
      })
      .select()
      .single();

    if (businessError) {
      console.error('Error creating business:', businessError);
      return c.json({ 
        error: 'Error al crear el negocio',
        details: businessError.message 
      }, 500);
    }

    // 5. Crear empleado (owner) asociado al negocio
    const { error: employeeError } = await supabase
      .from('employees')
      .insert({
        user_id: user.id,
        business_id: business.id,
        role: 'owner',
        is_active: true
      });

    if (employeeError) {
      console.error('Error creating employee:', employeeError);
      // No fallar si ya existe
    }

    // 6. Crear sucursal por defecto
    const { error: branchError } = await supabase
      .from('branches')
      .insert({
        business_id: business.id,
        name: 'Sucursal Principal',
        address: validatedData.businessAddress || 'Dirección por definir',
        phone: validatedData.businessPhone || null,
        is_active: true
      });

    if (branchError) {
      console.error('Error creating branch:', branchError);
      // No fallar si hay error en sucursal
    }

    // 7. Actualizar perfil del usuario con businessId
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        current_business_id: business.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (profileError) {
      console.error('Error updating user profile:', profileError);
    }

    const response: TrialActivationResponse = {
      success: true,
      business: {
        id: business.id,
        name: business.name,
        stripeCustomerId: stripeCustomer.id,
        stripeSubscriptionId: subscription.id,
        trialEndsAt: new Date(subscription.trial_end! * 1000).toISOString(),
        currency: validatedData.currency || "MXN",
        taxRegime: {
          code: taxRegime.code,
          name: taxRegime.name,
          type: taxRegime.type
        }
      },
      subscription: {
        id: subscription.id,
        status: subscription.status,
        trialEnd: subscription.trial_end!,
        currentPeriodEnd: subscription.current_period_end
      }
    };

    return c.json(response);

  } catch (error) {
    console.error('Error in trial activation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return c.json({ 
      error: 'Error al activar el trial',
      details: errorMessage 
    }, 500);
  }
});

// ===== CREACIÓN DE NEGOCIO CON TRIAL PERSONALIZADO (ADMIN) =====

// Crear negocio con trial personalizado (solo para administradores)
business.post("/create-with-custom-trial", async (c) => {
  try {
    // Obtener usuario del token
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Token de autorización requerido" }, 401);
    }

    const token = authHeader.substring(7);
    const { getUserFromToken } = await import("../utils/supabase.ts");
    const user = await getUserFromToken(token);
    
    if (!user) {
      return c.json({ error: "Usuario no encontrado" }, 401);
    }

    // Verificar que el usuario sea administrador
    const supabase = getSupabaseClient();
    const { data: adminCheck, error: adminError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminError || !adminCheck || !['admin', 'super_admin'].includes(adminCheck.role)) {
      return c.json({ 
        error: "Acceso denegado. Solo administradores pueden crear negocios con trial personalizado" 
      }, 403);
    }

    // Obtener datos del request
    const requestData = await c.req.json();
    
    // Validar datos con schema personalizado
    const customTrialSchema = trialActivationSchema.extend({
      trialDays: z.number()
        .min(1, "El trial debe ser de al menos 1 día")
        .max(365, "El trial no puede exceder 365 días"),
      reason: z.string()
        .min(10, "Debe proporcionar una razón para el trial personalizado")
        .max(500, "La razón no puede exceder 500 caracteres"),
      clientEmail: z.string()
        .email("Email del cliente inválido")
        .optional()
    });

    const validation = validateData(customTrialSchema, requestData);
    if (!validation.success) {
      return c.json({ 
        error: "Datos de entrada inválidos",
        details: validation.errors.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      }, 400);
    }
    
    const validatedData = validation.data;

    // Log de creación de trial personalizado
    console.log(`🎯 Trial personalizado creado por admin ${user.email}:`, {
      trialDays: validatedData.trialDays,
      reason: validatedData.reason,
      clientEmail: validatedData.clientEmail,
      businessName: validatedData.businessName
    });

    // Usar la lógica existente pero con trial personalizado
    const taxRegime = getTaxRegimeByCode(validatedData.taxRegime);
    if (!taxRegime) {
      return c.json({ 
        error: "Régimen fiscal no encontrado" 
      }, 400);
    }

    const stripe = getStripeClient();

    // 1. Crear o obtener cliente en Stripe
    const stripeCustomer = await stripe.createOrGetCustomer(
      validatedData.businessEmail,
      validatedData.billingName,
      {
        userId: user.id,
        businessName: validatedData.businessName,
        taxId: validatedData.taxId || '',
        customTrial: 'true',
        trialDays: validatedData.trialDays?.toString() || '7',
        createdBy: user.email || 'unknown'
      }
    );

    // 2. Procesar método de pago si se proporciona
    let paymentMethodId: string | undefined;
    if (validatedData.paymentMethod && validatedData.paymentMethod.card) {
      try {
        const paymentMethod = await stripe.createPaymentMethod(
          validatedData.paymentMethod.type,
          validatedData.paymentMethod.card
        );
        
        await stripe.attachPaymentMethodToCustomer(paymentMethod.id, stripeCustomer.id);
        paymentMethodId = paymentMethod.id;
      } catch (error) {
        console.error('Error processing payment method:', error);
      }
    }

    // 3. Crear trial personalizado
    let subscription: { id: string; trial_end: number | null; status: string; current_period_end: number };
    
    if (paymentMethodId) {
      // Si hay método de pago, crear suscripción mensual con trial personalizado
      const priceId = await stripe.getPriceByLookupKey('price_monthly');
      subscription = await stripe.createSubscriptionWithTrial(
        stripeCustomer.id,
        priceId,
        validatedData.trialDays,
        paymentMethodId
      );
    } else {
      // Si NO hay método de pago, crear trial gratuito personalizado
      const freeTrialPriceId = await stripe.getPriceByLookupKey('price_free_trial');
      subscription = await stripe.createFreeTrial(
        stripeCustomer.id,
        freeTrialPriceId,
        validatedData.trialDays
      );
    }

    // 4. Crear negocio en la base de datos con metadata especial
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .insert({
        name: validatedData.businessName,
        email: validatedData.businessEmail,
        phone: validatedData.businessPhone || null,
        address: validatedData.businessAddress || null,
        owner_id: user.id,
        stripe_customer_id: stripeCustomer.id,
        stripe_subscription_id: subscription.id,
        currency: validatedData.currency || "MXN",
        tax_regime: taxRegime.code,
        tax_id: validatedData.taxId || null,
        subscription_status: 'trialing',
        trial_ends_at: new Date(subscription.trial_end! * 1000).toISOString(),
        settings: {
          customTrial: true,
          trialDays: validatedData.trialDays,
          reason: validatedData.reason,
          createdBy: user.email,
          clientEmail: validatedData.clientEmail
        }
      })
      .select()
      .single();

    if (businessError) {
      console.error('Error creating business:', businessError);
      return c.json({ 
        error: 'Error al crear el negocio',
        details: businessError.message 
      }, 500);
    }

    // 5. Crear empleado (owner)
    const { error: employeeError } = await supabase
      .from('employees')
      .insert({
        business_id: business.id,
        user_id: user.id,
        role: 'owner',
        is_active: true,
        joined_at: new Date().toISOString()
      });

    if (employeeError) {
      console.error('Error creating employee:', employeeError);
    }

    // 6. Crear sucursal por defecto
    const { error: branchError } = await supabase
      .from('branches')
      .insert({
        business_id: business.id,
        name: 'Sucursal Principal',
        address: validatedData.businessAddress || 'Dirección por definir',
        phone: validatedData.businessPhone || null,
        is_active: true
      });

    if (branchError) {
      console.error('Error creating branch:', branchError);
    }

    // 7. Actualizar perfil del usuario con businessId
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        current_business_id: business.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (profileError) {
      console.error('Error updating user profile:', profileError);
    }

    const response: TrialActivationResponse = {
      success: true,
      business: {
        id: business.id,
        name: business.name,
        stripeCustomerId: stripeCustomer.id,
        stripeSubscriptionId: subscription.id,
        trialEndsAt: new Date(subscription.trial_end! * 1000).toISOString(),
        currency: validatedData.currency || "MXN",
        taxRegime: {
          code: taxRegime.code,
          name: taxRegime.name,
          type: taxRegime.type
        }
      },
      subscription: {
        id: subscription.id,
        status: subscription.status,
        trialEnd: subscription.trial_end!,
        currentPeriodEnd: subscription.current_period_end
      }
    };

    return c.json(response);

  } catch (error) {
    console.error('Error in custom trial creation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return c.json({ 
      error: 'Error al crear negocio con trial personalizado',
      details: errorMessage 
    }, 500);
  }
});

// ===== EXTENSIÓN DE TRIAL =====

// Extender trial cuando el usuario agrega método de pago
business.post("/extend-trial", async (c) => {
  try {
    // Obtener usuario del token
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Token de autorización requerido" }, 401);
    }

    const token = authHeader.substring(7);
    const { getUserFromToken } = await import("../utils/supabase.ts");
    const user = await getUserFromToken(token);
    
    if (!user) {
      return c.json({ error: "Usuario no encontrado" }, 401);
    }

    // Obtener datos del request
    const requestData = await c.req.json();
    
    // Validar que se proporcione método de pago
    if (!requestData.paymentMethod || !requestData.paymentMethod.card) {
      return c.json({ 
        error: "Método de pago requerido para extender el trial" 
      }, 400);
    }

    const supabase = getSupabaseClient();
    const stripe = getStripeClient();

    // 1. Obtener el negocio del usuario
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, stripe_customer_id, stripe_subscription_id')
      .eq('owner_id', user.id)
      .single();

    if (businessError || !business) {
      return c.json({ error: "Negocio no encontrado" }, 404);
    }

    // 2. Verificar que el trial aún esté activo
    const subscription = await stripe.getSubscription(business.stripe_subscription_id);
    if (!subscription || subscription.status !== 'trialing') {
      return c.json({ 
        error: "El trial ya ha expirado o no está activo" 
      }, 400);
    }

    // 3. Crear y adjuntar método de pago
    const paymentMethod = await stripe.createPaymentMethod(
      requestData.paymentMethod.type,
      requestData.paymentMethod.card
    );
    
    await stripe.attachPaymentMethodToCustomer(paymentMethod.id, business.stripe_customer_id);

    // 4. Actualizar la suscripción para extender el trial
    const updatedSubscription = await stripe.extendTrial(
      business.stripe_subscription_id,
      paymentMethod.id,
      7 // 7 días adicionales (total: 7 iniciales + 7 adicionales = 14 días)
    );

    // 5. Actualizar el negocio en la base de datos
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        stripe_subscription_id: updatedSubscription.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', business.id);

    if (updateError) {
      console.error('Error updating business:', updateError);
    }

    return c.json({
      success: true,
      message: "Trial extendido exitosamente por 7 días adicionales",
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        trialEnd: updatedSubscription.trial_end,
        currentPeriodEnd: updatedSubscription.current_period_end
      }
    });

  } catch (error) {
    console.error('Error extending trial:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return c.json({ 
      error: 'Error al extender el trial',
      details: errorMessage 
    }, 500);
  }
});

// ===== EXTENSIÓN DE TRIAL POR USUARIO (AGREGAR MÉTODO DE PAGO) =====

// Extender trial cuando usuario agrega método de pago (7 días adicionales)
business.post("/extend-trial-with-payment", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Token de autorización requerido" }, 401);
    }

    const token = authHeader.substring(7);
    const user = await getUserFromToken(token);
    if (!user) {
      return c.json({ error: "Usuario no encontrado" }, 401);
    }

    const requestData = await c.req.json();
    
    const paymentMethodSchema = z.object({
      paymentMethod: z.object({
        type: z.string(),
        card: z.object({
          number: z.string(),
          exp_month: z.number(),
          exp_year: z.number(),
          cvc: z.string()
        })
      })
    });

    const validation = validateData(paymentMethodSchema, requestData);

    if (!validation.success) {
      return c.json({ 
        error: "Datos de pago inválidos",
        issues: validation.errors?.issues.map((issue: { path: (string | number)[]; message: string }) => ({
          field: issue.path?.join('.'),
          message: issue.message
        }))
      }, 400);
    }

    const validatedData = validation.data as {
      paymentMethod: { type: string; card: { number: string; exp_month: number; exp_year: number; cvc: string } };
    };

    // 1. Obtener el negocio del usuario
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, stripe_customer_id, stripe_subscription_id, trial_ends_at, settings')
      .eq('owner_id', user.id)
      .single();

    if (businessError || !business) {
      return c.json({ error: "Negocio no encontrado" }, 404);
    }

    // 2. Verificar que el trial aún esté activo
    const stripe = getStripeClient();
    const subscription = await stripe.getSubscription(business.stripe_subscription_id);
    if (!subscription || subscription.status !== 'trialing') {
      return c.json({ 
        error: "El trial ya ha expirado o no está activo" 
      }, 400);
    }

    // 3. Crear método de pago
    const paymentMethod = await stripe.createPaymentMethod(
      validatedData.paymentMethod.type,
      validatedData.paymentMethod.card
    );
    
    await stripe.attachPaymentMethodToCustomer(paymentMethod.id, business.stripe_customer_id);

    // 4. Extender el trial por 7 días adicionales
    const updatedSubscription = await stripe.extendTrial(
      business.stripe_subscription_id,
      paymentMethod.id,
      7 // 7 días adicionales
    );

    // 5. Actualizar el negocio
    const currentSettings = business.settings || {};
    const updatedSettings = {
      ...currentSettings,
      trialExtended: true,
      paymentMethodAdded: true,
      extendedAt: new Date().toISOString(),
      totalTrialDays: 14 // 7 días base + 7 días adicionales
    };

    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        trial_ends_at: new Date(updatedSubscription.trial_end! * 1000).toISOString(),
        settings: updatedSettings,
        updated_at: new Date().toISOString()
      })
      .eq('id', business.id);

    if (updateError) {
      console.error('Error updating business:', updateError);
    }

    return c.json({
      success: true,
      message: "Trial extendido exitosamente por 7 días adicionales",
      trialEndsAt: new Date(updatedSubscription.trial_end! * 1000).toISOString(),
      totalTrialDays: 14
    });

  } catch (error) {
    console.error('Error extending trial:', error);
    return c.json({ 
      error: 'Error al extender el trial',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, 500);
  }
});

// ===== EXTENSIÓN DE TRIAL POR ADMINISTRADOR =====

// Extender trial de cualquier negocio (solo administradores)
business.post("/admin/extend-trial/:businessId", async (c) => {
  try {
    // Obtener usuario del token
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Token de autorización requerido" }, 401);
    }

    const token = authHeader.substring(7);
    const { getUserFromToken } = await import("../utils/supabase.ts");
    const user = await getUserFromToken(token);
    
    if (!user) {
      return c.json({ error: "Usuario no encontrado" }, 401);
    }

    // Verificar que el usuario sea administrador
    const supabase = getSupabaseClient();
    const { data: adminCheck, error: adminError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminError || !adminCheck || !['admin', 'super_admin'].includes(adminCheck.role)) {
      return c.json({ 
        error: "Acceso denegado. Solo administradores pueden extender trials" 
      }, 403);
    }

    const businessId = c.req.param('businessId');
    const requestData = await c.req.json();
    
    // Validar datos
    const extendTrialSchema = z.object({
      additionalDays: z.number()
        .min(1, "Debe extender al menos 1 día")
        .max(365, "No se puede extender más de 365 días"),
      reason: z.string()
        .min(10, "Debe proporcionar una razón para la extensión")
        .max(500, "La razón no puede exceder 500 caracteres")
    });

    const validation = validateData(extendTrialSchema, requestData);
    if (!validation.success) {
      return c.json({ 
        error: "Datos de entrada inválidos",
        details: validation.errors.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      }, 400);
    }
    
    const { additionalDays, reason } = validation.data as { additionalDays: number; reason: string };

    // 1. Obtener el negocio
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, stripe_subscription_id, settings')
      .eq('id', businessId)
      .single();

    if (businessError || !business) {
      return c.json({ error: "Negocio no encontrado" }, 404);
    }

    // 2. Verificar que el trial aún esté activo
    const stripe = getStripeClient();
    const subscription = await stripe.getSubscription(business.stripe_subscription_id);
    if (!subscription || subscription.status !== 'trialing') {
      return c.json({ 
        error: "El trial ya ha expirado o no está activo" 
      }, 400);
    }

    // 3. Extender el trial
    const updatedSubscription = await stripe.extendTrial(
      business.stripe_subscription_id,
      subscription.default_payment_method as string,
      additionalDays
    );

    // 4. Actualizar el negocio con la nueva información
    const currentSettings = business.settings || {};
    const updatedSettings = {
      ...currentSettings,
      trialExtensions: [
        ...(currentSettings.trialExtensions || []),
        {
          additionalDays,
          reason,
          extendedBy: user.email,
          extendedAt: new Date().toISOString()
        }
      ]
    };

    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        trial_ends_at: new Date(updatedSubscription.trial_end! * 1000).toISOString(),
        settings: updatedSettings,
        updated_at: new Date().toISOString()
      })
      .eq('id', businessId);

    if (updateError) {
      console.error('Error updating business:', updateError);
    }

    // Log de extensión de trial
    console.log(`🎯 Trial extendido por admin ${user.email}:`, {
      businessId,
      businessName: business.name,
      additionalDays,
      reason,
      newTrialEnd: new Date(updatedSubscription.trial_end! * 1000).toISOString()
    });

    return c.json({
      success: true,
      message: `Trial extendido exitosamente por ${additionalDays} días adicionales`,
      business: {
        id: business.id,
        name: business.name,
        newTrialEnd: new Date(updatedSubscription.trial_end! * 1000).toISOString()
      },
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        trialEnd: updatedSubscription.trial_end,
        currentPeriodEnd: updatedSubscription.current_period_end
      }
    });

  } catch (error) {
    console.error('Error extending trial by admin:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return c.json({ 
      error: 'Error al extender el trial',
      details: errorMessage 
    }, 500);
  }
});

// Obtener regímenes fiscales disponibles
business.get("/tax-regimes", async (c) => {
  try {
    const { TAX_REGIMES } = await import("../utils/taxRegimes.ts");
    
    return c.json({
      success: true,
      taxRegimes: TAX_REGIMES
    });
  } catch (error) {
    console.error('Error fetching tax regimes:', error);
    return c.json({ 
      error: 'Error al obtener regímenes fiscales',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, 500);
  }
});

// Obtener precios disponibles para suscripciones
business.get("/prices", async (c) => {
  try {
    const stripe = getStripeClient();
    const prices = await stripe.listPrices(true);
    
    return c.json({
      success: true,
      prices: prices.data.map((price) => ({
        id: price.id,
        nickname: price.nickname || undefined,
        unit_amount: price.unit_amount,
        currency: price.currency,
        recurring: price.recurring,
        active: price.active
      }))
    });
  } catch (error) {
    console.error('Error fetching prices:', error);
    return c.json({ 
      error: 'Error al obtener precios',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, 500);
  }
});

// ===== CAMBIO DE PLAN DE SUSCRIPCIÓN =====

// Cambiar plan de suscripción (mensual, anual, vitalicio)
business.post("/change-plan", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Token de autorización requerido" }, 401);
    }

    const token = authHeader.substring(7);
    const user = await getUserFromToken(token);
    if (!user) {
      return c.json({ error: "Usuario no encontrado" }, 401);
    }

    const requestData = await c.req.json();
    
    const planTypeSchema = z.object({
      planType: z.enum(['monthly', 'yearly', 'lifetime'])
    });

    const validation = validateData(planTypeSchema, requestData);

    if (!validation.success) {
      return c.json({ 
        error: "Tipo de plan inválido",
        issues: validation.errors?.issues.map((issue: { path: (string | number)[]; message: string }) => ({
          field: issue.path?.join('.'),
          message: issue.message
        }))
      }, 400);
    }

    const { planType } = validation.data as { planType: 'monthly' | 'yearly' | 'lifetime' };

    // 1. Obtener el negocio del usuario
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, stripe_customer_id, stripe_subscription_id, settings')
      .eq('owner_id', user.id)
      .single();

    if (businessError || !business) {
      return c.json({ error: "Negocio no encontrado" }, 404);
    }

    const stripe = getStripeClient();

    // 2. Determinar el precio según el tipo de plan
    let priceId: string;
    let planName: string;
    let amount: number;

    switch (planType) {
      case 'monthly':
        priceId = await stripe.getPriceByLookupKey('price_monthly');
        planName = 'Plan Mensual';
        amount = 275; // $275 MXN
        break;
      case 'yearly':
        priceId = await stripe.getPriceByLookupKey('price_yearly');
        planName = 'Plan Anual';
        amount = 2750; // $2,750 MXN
        break;
      case 'lifetime':
        priceId = await stripe.getPriceByLookupKey('price_full');
        planName = 'Licencia Vitalicia';
        amount = 39500; // $39,500 MXN
        break;
      default:
        return c.json({ error: "Tipo de plan no válido" }, 400);
    }

    // 3. Cambiar la suscripción
    const updatedSubscription = await stripe.changeSubscriptionPlan(
      business.stripe_subscription_id,
      priceId
    );

    // 4. Actualizar el negocio
    const currentSettings = business.settings || {};
    const updatedSettings = {
      ...currentSettings,
      currentPlan: planType,
      planName: planName,
      planAmount: amount,
      planChangedAt: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString()
      })
      .eq('id', business.id);

    if (updateError) {
      console.error('Error updating business:', updateError);
    }

    return c.json({
      success: true,
      message: `Plan cambiado exitosamente a ${planName}`,
      plan: {
        type: planType,
        name: planName,
        amount: amount,
        currency: 'MXN'
      },
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        current_period_end: updatedSubscription.current_period_end
      }
    });

  } catch (error) {
    console.error('Error changing plan:', error);
    return c.json({ 
      error: 'Error al cambiar el plan',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, 500);
  }
});

// ===== RUTAS DE NEGOCIOS =====

// Obtener información del negocio actual
business.get("/", (c) => {
  const business = getBusinessFromContext(c);
  const employee = getEmployeeFromContext(c);
  
  if (!business || !employee) {
    return c.json({ 
      error: 'Contexto de negocio requerido',
      code: 'BUSINESS_CONTEXT_REQUIRED'
    }, 400);
  }

  return c.json({
    business: {
      id: business.id,
      name: business.name,
      subscription_status: business.subscription_status,
      trial_ends_at: business.trial_ends_at,
      settings: business.settings,
      created_at: business.created_at
    },
    employee: {
      id: employee.id,
      role: employee.role,
      is_active: employee.is_active
    }
  });
});

// Actualizar configuración del negocio (solo owner/admin)
business.patch("/settings", requireAdminOrOwner, async (c) => {
  const business = getBusinessFromContext(c);
  const user = getUserFromContext(c);
  
  if (!business || !user) {
    return c.json({ 
      error: 'Contexto de negocio y usuario requerido',
      code: 'CONTEXT_REQUIRED'
    }, 400);
  }
  
  const requestData = await c.req.json();
  
  // Validar datos con Zod schema
  const validation = validateData(businessSettingsUpdateSchema, requestData);
  if (!validation.success) {
    return c.json({ 
      error: 'Datos de entrada inválidos',
      details: validation.errors.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message
      }))
    }, 400);
  }
  
  const updateData = validation.data;
  const supabase = getSupabaseClient();
  
  // Solo permitir actualizar campos específicos
  const allowedFields = ['settings', 'name'] as const;
  const filteredData: Record<string, unknown> = {};
  
  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      filteredData[field] = updateData[field];
    }
  }
  
  if (Object.keys(filteredData).length === 0) {
    return c.json({ 
      error: 'No hay campos válidos para actualizar',
      code: 'NO_VALID_FIELDS'
    }, 400);
  }
  
  filteredData.modified_by = user.id;
  
  const { data, error } = await supabase
    .from('businesses')
    .update(filteredData)
    .eq('id', business.id)
    .select()
    .single();
    
  if (error) {
    return c.json({ 
      error: error.message,
      code: 'UPDATE_FAILED'
    }, 500);
  }
  
  return c.json({ business: data });
});

// Obtener empleados del negocio (solo owner/admin)
business.get("/employees", requireAdminOrOwner, async (c) => {
  const business = getBusinessFromContext(c);
  
  if (!business) {
    return c.json({ 
      error: 'Contexto de negocio requerido',
      code: 'BUSINESS_CONTEXT_REQUIRED'
    }, 400);
  }
  
  const supabase = getSupabaseClient();
  
  const { data: employees, error } = await supabase
    .from('employees')
    .select(`
      id,
      role,
      is_active,
      created_at,
      profiles!inner (
        id,
        email,
        full_name,
        avatar_url
      )
    `)
    .eq('business_id', business.id)
    .order('created_at', { ascending: false });
    
  if (error) {
    return c.json({ 
      error: error.message,
      code: 'FETCH_FAILED'
    }, 500);
  }
  
  return c.json({ employees });
});

// Invitar nuevo empleado (solo owner)
business.post("/employees/invite", requireOwner, async (c) => {
  const business = getBusinessFromContext(c);
  const user = getUserFromContext(c);
  
  if (!business || !user) {
    return c.json({ 
      error: 'Contexto de negocio y usuario requerido',
      code: 'CONTEXT_REQUIRED'
    }, 400);
  }
  
  const requestData = await c.req.json();
  
  // Validar datos con Zod schema
  const validation = validateData(employeeInvitationSchema, requestData);
  if (!validation.success) {
    return c.json({ 
      error: 'Datos de entrada inválidos',
      details: validation.errors.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message
      }))
    }, 400);
  }
  
  const { email, role } = validation.data;
  
  const supabase = getSupabaseClient();
  
  // Verificar si el usuario ya existe
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existingUser = existingUsers.users.find(user => user.email === email);
  
  if (existingUser) {
    // Usuario existe, verificar si ya es empleado
    const { data: existingEmployee } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', existingUser.id)
      .eq('business_id', business.id)
      .single();
      
    if (existingEmployee) {
      return c.json({ 
        error: 'El usuario ya es empleado de este negocio',
        code: 'EMPLOYEE_ALREADY_EXISTS'
      }, 400);
    }
  }
  
  // Crear invitación
  const { data: invitation, error } = await supabase
    .from('employee_invitations')
    .insert({
      business_id: business.id,
      email,
      role,
      invited_by: user.id,
      status: 'pending'
    })
    .select()
    .single();
    
  if (error) {
    return c.json({ 
      error: error.message,
      code: 'INVITATION_FAILED'
    }, 500);
  }
  
  // TODO: Enviar email de invitación
  
  return c.json({ 
    invitation,
    message: 'Invitación enviada exitosamente'
  }, 201);
});

// Obtener estadísticas del negocio (solo owner/admin)
business.get("/stats", requireAdminOrOwner, async (c) => {
  const business = getBusinessFromContext(c);
  
  if (!business) {
    return c.json({ 
      error: 'Contexto de negocio requerido',
      code: 'BUSINESS_CONTEXT_REQUIRED'
    }, 400);
  }
  
  const supabase = getSupabaseClient();
  
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = new Date().toISOString().slice(0, 7);
  
  // Estadísticas de hoy
  const { count: todayOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', business.id)
    .eq('delivery_date', today);
    
  // Estadísticas del mes
  const { count: monthOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', business.id)
    .gte('delivery_date', `${thisMonth}-01`)
    .lte('delivery_date', `${thisMonth}-31`);
    
  // Total de empleados activos
  const { count: activeEmployees } = await supabase
    .from('employees')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', business.id)
    .eq('is_active', true);
    
  return c.json({
    stats: {
      today: {
        orders: todayOrders || 0
      },
      thisMonth: {
        orders: monthOrders || 0
      },
      employees: {
        active: activeEmployees || 0
      }
    }
  });
});

// 🔄 NEW: Employee disassociation endpoint (when employee leaves business)
business.post("/employees/:employeeId/disassociate", requireAdminOrOwner, async (c) => {
  try {
    const business = getBusinessFromContext(c);
    const user = getUserFromContext(c);
    const employeeId = c.req.param('employeeId');
    
    if (!business || !user) {
      return c.json({ 
        error: 'Contexto de negocio y usuario requerido',
        code: 'CONTEXT_REQUIRED'
      }, 400);
    }

    const supabase = getSupabaseClient();

    // Get employee to disassociate
    const { data: employeeToDisassociate, error: fetchError } = await supabase
      .from('employees')
      .select(`
        *,
        profile:profiles(email, name)
      `)
      .eq('id', employeeId)
      .eq('business_id', business.id)
      .eq('is_active', true)
      .single();

    if (fetchError || !employeeToDisassociate) {
      return c.json({ 
        error: 'Empleado no encontrado o ya desvinculado',
        code: 'EMPLOYEE_NOT_FOUND'
      }, 404);
    }

    // Prevent disassociating the last owner
    if (employeeToDisassociate.role === 'owner') {
      const { data: otherOwners, error: ownersError } = await supabase
        .from('employees')
        .select('id')
        .eq('business_id', business.id)
        .eq('role', 'owner')
        .eq('is_active', true);

      if (ownersError) {
        return c.json({ 
          error: 'Error al verificar propietarios',
          code: 'OWNERS_CHECK_ERROR'
        }, 500);
      }

      if (otherOwners && otherOwners.length === 1) {
        return c.json({ 
          error: 'No puedes desvincular al único propietario del negocio',
          code: 'LAST_OWNER_CANNOT_DISASSOCIATE'
        }, 400);
      }
    }

    // Soft delete employee (disassociate)
    const { error: disassociateError } = await supabase
      .from('employees')
      .update({ 
        is_active: false,
        disassociated_at: new Date().toISOString(),
        disassociated_by: user.id
      })
      .eq('id', employeeId);

    if (disassociateError) {
      return c.json({ 
        error: 'Error al desvincular empleado',
        code: 'DISASSOCIATE_ERROR'
      }, 500);
    }

    // 📧 NOTIFICATION: Notify business owner about disassociation
    try {
      await notifyOwnerOfDisassociation({
        employeeEmail: employeeToDisassociate.profile?.email || 'unknown',
        employeeName: employeeToDisassociate.profile?.name || 'unknown',
        employeeRole: employeeToDisassociate.role,
        businessName: business.name,
        disassociatedBy: user.email || 'unknown',
        disassociationDate: new Date().toISOString()
      });
    } catch (notificationError) {
      console.warn('Warning: Could not send disassociation notification:', notificationError);
    }

    // 📋 COMPLIANCE: Log disassociation for compliance
    try {
      await supabase
        .from('account_deletion_logs')
        .insert({
          user_id: employeeToDisassociate.user_id,
          user_email: employeeToDisassociate.profile?.email || 'unknown',
          business_id: business.id,
          business_name: business.name,
          user_role: employeeToDisassociate.role,
          deletion_reason: 'employee_disassociation',
          deletion_method: 'admin_disassociation',
          ip_address: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
          user_agent: c.req.header('user-agent'),
          grace_period_start: new Date().toISOString(),
          grace_period_end: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days
        });
    } catch (logError) {
      console.warn('Warning: Could not log disassociation for compliance:', logError);
    }

    return c.json({ 
      message: 'Empleado desvinculado exitosamente',
      code: 'EMPLOYEE_DISASSOCIATED',
      employee: {
        id: employeeToDisassociate.id,
        email: employeeToDisassociate.profile?.email,
        role: employeeToDisassociate.role
      }
    });

  } catch (error) {
    console.error('Unexpected error in POST /business/employees/:employeeId/disassociate:', error);
    return c.json({ 
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
});

// Helper function to notify owner of employee disassociation
async function notifyOwnerOfDisassociation(data: {
  employeeEmail: string;
  employeeName: string;
  employeeRole: string;
  businessName: string;
  disassociatedBy: string;
  disassociationDate: string;
}) {
  // Send email notification to business owner
  try {
    await emailNotificationService.notifyOwnerOfEmployeeDisassociation({
      userEmail: data.employeeEmail,
      userName: data.employeeName,
      businessName: data.businessName,
      userRole: data.employeeRole,
      deletionDate: data.disassociationDate
    });
  } catch (emailError) {
    console.warn('Warning: Could not send disassociation email notification:', emailError);
  }
  
  // Also log for debugging
  console.log(`📧 Disassociation notification: ${data.employeeEmail} (${data.employeeRole}) left ${data.businessName}`);
}

// ===== ENDPOINTS PARA CÓDIGOS DE INVITACIÓN =====

// Unirse a un negocio usando código de invitación
business.post("/join", async (c) => {
  try {
    // Obtener usuario del token
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Token de autorización requerido" }, 401);
    }

    const token = authHeader.substring(7);
    const { getUserFromToken } = await import("../utils/supabase.ts");
    const user = await getUserFromToken(token);
    
    if (!user) {
      return c.json({ error: "Usuario no encontrado" }, 401);
    }

    // Obtener y validar datos del request
    const requestData = await c.req.json();
    const { joinBusinessSchema } = await import("../utils/validation.ts");
    
    const validation = validateData(joinBusinessSchema, requestData);
    if (!validation.success) {
      return c.json({ 
        error: "Datos de entrada inválidos",
        details: validation.errors.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      }, 400);
    }
    
    const { businessCode } = validation.data;
    const supabase = getSupabaseClient();

    // Verificar que el usuario no esté ya en un negocio
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('current_business_id')
      .eq('id', user.id)
      .single();

    if (existingProfile?.current_business_id) {
      return c.json({ 
        error: "Ya estás asociado a un negocio",
        code: 'ALREADY_IN_BUSINESS'
      }, 400);
    }

    // Usar la función de base de datos para validar y usar el código
    const { data: result, error: functionError } = await supabase
      .rpc('use_invitation_code', {
        invitation_code: businessCode,
        user_id: user.id
      });

    if (functionError) {
      console.error('Error using invitation code:', functionError);
      return c.json({ 
        error: "Error al procesar el código de invitación",
        code: 'INVITATION_PROCESSING_ERROR'
      }, 500);
    }

    if (!result.success) {
      return c.json({ 
        error: result.error,
        code: 'INVITATION_VALIDATION_FAILED'
      }, 400);
    }

    // Obtener información del negocio
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('id', result.business_id)
      .single();

    if (businessError || !business) {
      console.error('Error fetching business:', businessError);
      return c.json({ 
        error: "Error al obtener información del negocio",
        code: 'BUSINESS_FETCH_ERROR'
      }, 500);
    }

    // Crear empleado asociado al negocio
    const { error: employeeError } = await supabase
      .from('employees')
      .insert({
        user_id: user.id,
        business_id: business.id,
        role: result.role,
        is_active: true
      });

    if (employeeError) {
      console.error('Error creating employee:', employeeError);
      return c.json({ 
        error: "Error al crear la asociación con el negocio",
        code: 'EMPLOYEE_CREATION_ERROR'
      }, 500);
    }

    // Actualizar perfil del usuario con businessId
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        current_business_id: business.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (profileError) {
      console.error('Error updating user profile:', profileError);
      // No fallar si hay error en perfil
    }

    return c.json({
      success: true,
      business: {
        id: business.id,
        name: business.name,
        role: result.role
      },
      message: "Te has unido al negocio exitosamente"
    });

  } catch (error) {
    console.error('Error in business join:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return c.json({ 
      error: 'Error al unirse al negocio',
      details: errorMessage,
      code: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
});

// Crear código de invitación (solo owner/admin)
business.post("/invitation-codes", requireAdminOrOwner, async (c) => {
  try {
    const business = getBusinessFromContext(c);
    const user = getUserFromContext(c);
    
    if (!business || !user) {
      return c.json({ 
        error: 'Contexto de negocio y usuario requerido',
        code: 'CONTEXT_REQUIRED'
      }, 400);
    }
    
    const requestData = await c.req.json();
    const { createInvitationCodeSchema } = await import("../utils/validation.ts");
    
    const validation = validateData(createInvitationCodeSchema, requestData);
    if (!validation.success) {
      return c.json({ 
        error: 'Datos de entrada inválidos',
        details: validation.errors.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      }, 400);
    }
    
    const { role, max_uses, expires_in_hours, notes } = validation.data;
    const supabase = getSupabaseClient();

    // Generar código único usando la función de base de datos
    const { data: generatedCode, error: codeError } = await supabase
      .rpc('generate_invitation_code');

    if (codeError || !generatedCode) {
      console.error('Error generating invitation code:', codeError);
      return c.json({ 
        error: 'Error al generar el código de invitación',
        code: 'CODE_GENERATION_ERROR'
      }, 500);
    }

    // Crear el código de invitación
    const expiresAt = new Date(Date.now() + (expires_in_hours || 24) * 60 * 60 * 1000);
    
    const { data: invitationCode, error: insertError } = await supabase
      .from('business_invitation_codes')
      .insert({
        business_id: business.id,
        code: generatedCode,
        created_by: user.id,
        expires_at: expiresAt.toISOString(),
        max_uses: max_uses || 1,
        role,
        notes
      })
      .select()
      .single();
      
    if (insertError) {
      console.error('Error creating invitation code:', insertError);
      return c.json({ 
        error: 'Error al crear el código de invitación',
        code: 'INVITATION_CREATION_ERROR'
      }, 500);
    }
    
    return c.json({ 
      invitationCode,
      message: 'Código de invitación creado exitosamente'
    }, 201);

  } catch (error) {
    console.error('Error creating invitation code:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return c.json({ 
      error: 'Error al crear el código de invitación',
      details: errorMessage,
      code: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
});

// Obtener códigos de invitación del negocio (solo owner/admin)
business.get("/invitation-codes", requireAdminOrOwner, async (c) => {
  try {
    const business = getBusinessFromContext(c);
    
    if (!business) {
      return c.json({ 
        error: 'Contexto de negocio requerido',
        code: 'CONTEXT_REQUIRED'
      }, 400);
    }
    
    const supabase = getSupabaseClient();

    // Obtener códigos de invitación
    const { data: invitationCodes, error: codesError } = await supabase
      .from('business_invitation_codes')
      .select(`
        *,
        created_by_profile:profiles!business_invitation_codes_created_by_fkey(name, email)
      `)
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });

    if (codesError) {
      console.error('Error fetching invitation codes:', codesError);
      return c.json({ 
        error: 'Error al obtener los códigos de invitación',
        code: 'CODES_FETCH_ERROR'
      }, 500);
    }

    // Obtener estadísticas
    const stats = {
      total_codes: invitationCodes.length,
      active_codes: invitationCodes.filter(code => code.status === 'active').length,
      used_codes: invitationCodes.filter(code => code.status === 'used').length,
      expired_codes: invitationCodes.filter(code => code.status === 'expired').length,
      disabled_codes: invitationCodes.filter(code => code.status === 'disabled').length
    };
    
    return c.json({ 
      invitationCodes,
      stats
    });

  } catch (error) {
    console.error('Error fetching invitation codes:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return c.json({ 
      error: 'Error al obtener los códigos de invitación',
      details: errorMessage,
      code: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
});

// Desactivar código de invitación (solo owner/admin)
business.patch("/invitation-codes/:codeId", requireAdminOrOwner, async (c) => {
  try {
    const business = getBusinessFromContext(c);
    const codeId = c.req.param('codeId');
    
    if (!business || !codeId) {
      return c.json({ 
        error: 'Contexto de negocio y ID de código requeridos',
        code: 'CONTEXT_REQUIRED'
      }, 400);
    }
    
    const requestData = await c.req.json();
    const { updateInvitationCodeSchema } = await import("../utils/validation.ts");
    
    const validation = validateData(updateInvitationCodeSchema, requestData);
    if (!validation.success) {
      return c.json({ 
        error: 'Datos de entrada inválidos',
        details: validation.errors.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      }, 400);
    }
    
    const supabase = getSupabaseClient();

    // Verificar que el código pertenece al negocio
    const { data: existingCode, error: fetchError } = await supabase
      .from('business_invitation_codes')
      .select('id, status')
      .eq('id', codeId)
      .eq('business_id', business.id)
      .single();

    if (fetchError || !existingCode) {
      return c.json({ 
        error: 'Código de invitación no encontrado',
        code: 'CODE_NOT_FOUND'
      }, 404);
    }

    // Actualizar el código
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    
    if (validation.data.status !== undefined) {
      updateData.status = validation.data.status;
    }
    if (validation.data.max_uses !== undefined) {
      updateData.max_uses = validation.data.max_uses;
    }
    if (validation.data.expires_in_hours !== undefined) {
      updateData.expires_at = new Date(Date.now() + validation.data.expires_in_hours * 60 * 60 * 1000).toISOString();
    }
    if (validation.data.notes !== undefined) {
      updateData.notes = validation.data.notes;
    }

    const { data: updatedCode, error: updateError } = await supabase
      .from('business_invitation_codes')
      .update(updateData)
      .eq('id', codeId)
      .select()
      .single();
      
    if (updateError) {
      console.error('Error updating invitation code:', updateError);
      return c.json({ 
        error: 'Error al actualizar el código de invitación',
        code: 'CODE_UPDATE_ERROR'
      }, 500);
    }
    
    return c.json({ 
      invitationCode: updatedCode,
      message: 'Código de invitación actualizado exitosamente'
    });

  } catch (error) {
    console.error('Error updating invitation code:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return c.json({ 
      error: 'Error al actualizar el código de invitación',
      details: errorMessage,
      code: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
});

// Limpiar códigos expirados (solo owner/admin)
business.post("/invitation-codes/cleanup", requireAdminOrOwner, async (c) => {
  try {
    const business = getBusinessFromContext(c);
    
    if (!business) {
      return c.json({ 
        error: 'Contexto de negocio requerido',
        code: 'CONTEXT_REQUIRED'
      }, 400);
    }
    
    const supabase = getSupabaseClient();

    // Ejecutar limpieza usando la función de base de datos
    const { data: cleanedCount, error: cleanupError } = await supabase
      .rpc('cleanup_expired_invitation_codes');

    if (cleanupError) {
      console.error('Error cleaning up expired codes:', cleanupError);
      return c.json({ 
        error: 'Error al limpiar códigos expirados',
        code: 'CLEANUP_ERROR'
      }, 500);
    }
    
    return c.json({ 
      message: `Se limpiaron ${cleanedCount} códigos expirados`,
      cleaned_count: cleanedCount
    });

  } catch (error) {
    console.error('Error cleaning up expired codes:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return c.json({ 
      error: 'Error al limpiar códigos expirados',
      details: errorMessage,
      code: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
});

export default business; 