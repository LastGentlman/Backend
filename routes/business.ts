import { Hono } from "hono";
import { getSupabaseClient } from "../utils/supabase.ts";
import { requireOwner, requireAdminOrOwner } from "../middleware/auth.ts";
import { getBusinessFromContext, getEmployeeFromContext, getUserFromContext } from "../types/context.ts";
import { getStripeClient } from "../utils/stripe.ts";
import { getTaxRegimeByCode, isValidTaxRegime as _isValidTaxRegime } from "../utils/taxRegimes.ts";
import { validateData, employeeInvitationSchema, trialActivationSchema, businessSettingsUpdateSchema } from "../utils/validation.ts";
import type { TrialActivationRequest as _TrialActivationRequest, TrialActivationResponse } from "../types/business.ts";
import type { Price } from "../types/stripe.ts";

const business = new Hono();

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
    if (validatedData.paymentMethod) {
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

    // 3. Crear suscripción con trial de 7 días
    // Nota: Necesitas crear un Price en Stripe primero
    const priceId = Deno.env.get('STRIPE_PRICE_ID') || 'price_default';
    
    const subscription = await stripe.createSubscriptionWithTrial(
      stripeCustomer.id,
      priceId,
      7, // 7 días de trial
      paymentMethodId
    );

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
      prices: prices.data.map((price: Price) => ({
        id: price.id,
        nickname: price.nickname,
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

export default business; 