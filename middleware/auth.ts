import { getSupabaseClient } from '../utils/supabase.ts';
import { Context } from "https://deno.land/x/hono@v3.11.7/mod.ts";

interface Employee {
  id: string;
  role: 'owner' | 'admin' | 'seller';
  is_active: boolean;
  business_id: string;
  created_at: string;
  // Add other properties as needed
}

export const authMiddleware = async (c: Context, next: () => Promise<void | Response>): Promise<void | Response> => {

  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (!token) {
    return c.json({ 
      error: 'Token de autorización requerido',
      code: 'AUTH_TOKEN_MISSING',
      message: 'Incluye el header: Authorization: Bearer <token>'
    }, 401);
  }

  try {

    const supabase = getSupabaseClient();
    
    // Verificar token con Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return c.json({ 
        error: 'Token inválido o expirado',
        code: 'AUTH_TOKEN_INVALID',
        details: authError?.message
      }, 401);
    }

    // 🔥 CRÍTICO: Verificar acceso empresarial
    const businessId = c.req.param('businessId') || c.req.query('business_id');
    
    if (businessId) {
      // Verificar que el usuario es empleado activo del negocio
      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .select(`
          id,
          role,
          is_active,
          business_id,
          created_at`)
        .eq('user_id', user.id)
        .eq('business_id', businessId)
        .eq('is_active', true)
        .single();

      if (employeeError || !employee) {
        return c.json({ 
          error: 'Sin acceso a este negocio',
          code: 'BUSINESS_ACCESS_DENIED',
          details: `Usuario ${user.email} no es empleado activo del negocio ${businessId}`
        }, 403);
      }

      // Verificar estado del negocio
      const {data: business, error: businessError} = await supabase
        .from('business')
        .select('id, name, subscription_status, trial_ends_at, settings')
        .eq('id', businessId)
        .single();

      if (businessError || !business) {
        return c.json({
          error: 'Negocio no encontrado',
          code: 'BUSINESS_NOT_FOUND',
          details: `El negocio ${businessId} no existe`
        }, 404)
      }

      // Verifica si el negocio esta suspendido
      if (business.subscription_status === 'suspended') {
        return c.json({ 
          error: 'Negocio suspendido. Contacta al Administrador.',
          code: 'BUSINESS_SUSPENDED',
          details: `El negocio ${business.name} está suspendido. Contacta al Administrador.`
        }, 403);
      }

      // Verificar trial no expirado
      if (business.subscription_status === 'trial' && 
          new Date(business.trial_ends_at) < new Date()) {
        return c.json({ 
          error: 'Período de prueba expirado. Actualiza tu suscripción.',
          code: 'TRIAL_EXPIRED',
          trial_ended: business.trial_ends_at,
          details: `El negocio ${business.name} ha expirado el período de prueba.`
        }, 402); // Payment Required
      }

      // Agregar datos al contexto
      c.set('user', user);
      c.set('employee', employee);
      c.set('business', business);

      console.log(`✅ Auth success: ${user.email} (${employee.role}) -> ${business.name}`);

    } else {
      c.set('user', user);
      console.log(`✅ Auth success: ${user.email} (Sin negocio)`);
    }

    return await next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    return c.json({ 
      error: 'Error interno de autenticación',
      code: 'AUTH_INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }, 500);
  }
};

// =============================================================================
// MIDDLEWARES ESPECÍFICOS DE ROLES
// =============================================================================

// Solo propietarios (owners)
export const requireOwner = async (c: Context, next: () => Promise<void>) => {
  const employee = c.get('employee');
  
  if (!employee) {
    return c.json({ 
      error: 'Esta acción requiere acceso a un negocio específico',
      code: 'BUSINESS_CONTEXT_REQUIRED'
    }, 400);
  }
  
  if ((employee as Employee).role !== 'owner') {
    return c.json({ 
      error: 'Solo propietarios pueden realizar esta acción',
      code: 'OWNER_REQUIRED',
      current_role: (employee as Employee).role
    }, 403);
  }

  await next();
};

// Administradores o propietarios
export const requireAdminOrOwner = async (c: Context, next: () => Promise<void>) => {
  const employee = c.get('employee');
  
  if (!employee) {
    return c.json({ 
      error: 'Esta acción requiere acceso a un negocio específico',
      code: 'BUSINESS_CONTEXT_REQUIRED'
    }, 400);
  }
  
  if (!['owner', 'admin'].includes((employee as Employee).role)) {
    return c.json({ 
      error: 'Permisos insuficientes. Se requiere rol de administrador o propietario.',
      code: 'INSUFFICIENT_PERMISSIONS',
      current_role: (employee as Employee).role,
      required_roles: ['owner', 'admin']
    }, 403);
  }

  await next();
};

// Cualquier empleado activo (owner, admin, seller)
export const requireEmployee = async (c: Context, next: () => Promise<void>) => {
  const employee = c.get('employee');
  
  if (!employee) {
    return c.json({ 
      error: 'Esta acción requiere ser empleado de un negocio',
      code: 'EMPLOYEE_REQUIRED'
    }, 403);
  }
  
  await next();
};

// =============================================================================
// UTILITARIOS PARA VERIFICAR PERMISOS
// =============================================================================

export const Permissions = {
  // Verificar si puede crear pedidos
  canCreateOrders: (employee: Employee): boolean => {
    return employee && ['owner', 'admin', 'seller'].includes(employee.role);
  },

  // Verificar si puede ver reportes financieros
  canViewReports: (employee: Employee): boolean => {
    return employee && ['owner', 'admin'].includes(employee.role);
  },

  // Verificar si puede gestionar empleados
  canManageEmployees: (employee: Employee): boolean => {
    return employee && employee.role === 'owner';
  },

  // Verificar si puede modificar configuración del negocio
  canModifySettings: (employee: Employee): boolean => {
    return employee && ['owner', 'admin'].includes(employee.role);
  },

  // Verificar si puede eliminar pedidos
  canDeleteOrders: (employee: Employee): boolean => {
    return employee && ['owner', 'admin'].includes(employee.role);
  },

  // Verificar si puede ver pedidos de otros empleados
  canViewAllOrders: (employee: Employee): boolean => {
    return employee && ['owner', 'admin'].includes(employee.role);
  },

  // Verificar si puede gestionar productos
  canManageProducts: (employee: Employee): boolean => {
    return employee && ['owner', 'admin'].includes(employee.role);
  }
};

// =============================================================================
// EJEMPLO DE USO EN RUTAS
// =============================================================================

/*
// En tus rutas, úsalo así:

// ✅ Solo empleados autenticados
app.get('/api/orders/:businessId/list', async (c) => {
  const employee = c.get('employee');
  const business = c.get('business');
  // ... lógica
});

// ✅ Solo owners
app.delete('/api/orders/:businessId/:orderId', requireOwner, async (c) => {
  // Solo owners pueden eliminar
});

// ✅ Owners o admins
app.post('/api/business/:businessId/settings', requireAdminOrOwner, async (c) => {
  // Solo owners o admins pueden cambiar configuración
});

// ✅ Verificación manual de permisos
app.get('/api/orders/:businessId/reports', async (c) => {
  const employee = c.get('employee');
  
  if (!Permissions.canViewReports(employee)) {
    return c.json({ error: 'Sin permisos para ver reportes' }, 403);
  }
  
  // ... lógica de reportes
});
*/