import { Hono } from "hono";
import { getSupabaseClient } from "../utils/supabase.ts";
import { requireOwner, requireAdminOrOwner } from "../middleware/auth.ts";

const business = new Hono();

// ===== RUTAS DE NEGOCIOS =====

// Obtener información del negocio actual
business.get("/", async (c) => {
  const business = c.get('business');
  const employee = c.get('employee');
  
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
  const business = c.get('business');
  const user = c.get('user');
  const updateData = await c.req.json();
  
  const supabase = getSupabaseClient();
  
  // Solo permitir actualizar campos específicos
  const allowedFields = ['settings', 'name'];
  const filteredData: any = {};
  
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
  const business = c.get('business');
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
  const business = c.get('business');
  const user = c.get('user');
  const { email, role } = await c.req.json();
  
  if (!email || !role) {
    return c.json({ 
      error: 'Email y rol son requeridos',
      code: 'MISSING_REQUIRED_FIELDS'
    }, 400);
  }
  
  if (!['admin', 'seller'].includes(role)) {
    return c.json({ 
      error: 'Rol inválido. Solo se permiten: admin, seller',
      code: 'INVALID_ROLE'
    }, 400);
  }
  
  const supabase = getSupabaseClient();
  
  // Verificar si el usuario ya existe
  const { data: existingUser } = await supabase.auth.admin.getUserByEmail(email);
  
  if (existingUser.user) {
    // Usuario existe, verificar si ya es empleado
    const { data: existingEmployee } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', existingUser.user.id)
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
  const business = c.get('business');
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