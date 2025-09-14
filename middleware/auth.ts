import { getSupabaseClient } from '../utils/supabase.ts';
import { Context } from "hono";
import { createRateLimiter } from '../utils/rateLimiter.ts';
import { tokenService } from '../services/TokenManagementService.ts';
import { securityMonitor } from '../services/SecurityMonitoringService.ts';

interface Employee {
  id: string;
  role: 'owner' | 'admin' | 'seller';
  is_active: boolean;
  business_id: string;
  created_at: string;
  // Add other properties as needed
}

// Rate limiter for authentication attempts per user
const userAuthRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 10 // 10 attempts per 5 minutes
});

// Enhanced authentication middleware using TokenManagementService
export const authMiddleware = async (c: Context, next: () => Promise<void | Response>): Promise<void | Response> => {

  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (!token) {
    // 🔒 NEW: Log security event for missing token
    securityMonitor.logEvent({
      eventType: 'login_failed',
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
      userAgent: c.req.header('user-agent') || 'unknown',
      details: { reason: 'Missing authorization token' },
      severity: 'low'
    });

    return c.json({ 
      error: 'Token de autorización requerido',
      code: 'AUTH_TOKEN_MISSING',
      message: 'Incluye el header: Authorization: Bearer <token>'
    }, 401);
  }

  try {
    // 🔒 ENHANCED: Use TokenManagementService for comprehensive validation
    const validationResult = await tokenService.validateToken(token);
    
    if (!validationResult.isValid) {
      // 🔒 NEW: Log security event for invalid token
      securityMonitor.logEvent({
        userId: validationResult.user?.id,
        eventType: 'login_failed',
        ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
        userAgent: c.req.header('user-agent') || 'unknown',
        details: { 
          reason: validationResult.error || 'Token inválido',
          code: validationResult.code || 'AUTH_TOKEN_INVALID'
        },
        severity: validationResult.code === 'AUTH_TOKEN_BLACKLISTED' ? 'high' : 'medium'
      });

      return c.json({ 
        error: validationResult.error || 'Token inválido',
        code: validationResult.code || 'AUTH_TOKEN_INVALID',
        message: 'Token no válido o cuenta suspendida'
      }, 401);
    }

    const user = validationResult.user;

    // 🔒 NEW: Log successful authentication
    securityMonitor.logEvent({
      userId: user?.id,
      eventType: 'login_success',
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
      userAgent: c.req.header('user-agent') || 'unknown',
      details: { 
        email: user?.email || 'unknown',
        tokenType: 'access'
      },
      severity: 'low'
    });

    // 🔒 NEW: Apply user-specific rate limiting
    const _userKey = `user_auth:${user?.id}`;
    const rateLimitResult = await userAuthRateLimiter(c, async () => {});
    
    if (rateLimitResult && rateLimitResult.status === 429) {
      // Mark account as potentially compromised after too many failed attempts
      tokenService.markAccountAsCompromised(
        user?.id || 'unknown', 
        'Rate limit exceeded', 
        'system'
      );

      // 🔒 NEW: Log rate limit exceeded event
      securityMonitor.logEvent({
        userId: user?.id || 'unknown',
        eventType: 'rate_limit_exceeded',
        ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
        userAgent: c.req.header('user-agent') || 'unknown',
        details: { 
          reason: 'User-specific rate limit exceeded',
          email: user?.email || 'unknown'
        },
        severity: 'high'
      });

      return c.json({ 
        error: 'Demasiados intentos de autenticación. Has excedido el límite de 10 intentos por 5 minutos.',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Tu cuenta ha sido suspendida temporalmente por seguridad',
        details: {
          maxAttempts: 10,
          timeWindow: "5 minutos",
          retryAfter: 300
        }
      }, 429);
    }

    // 🔥 CRÍTICO: Verificar acceso empresarial
    const businessId = c.req.param('businessId') || c.req.query('business_id');
    
    if (businessId) {
      const supabase = getSupabaseClient();
      
      // Verificar que el usuario es empleado activo del negocio
      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .select(`
          id,
          role,
          is_active,
          business_id,
          created_at`)
        .eq('user_id', user?.id || 'unknown')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .single();

      if (employeeError || !employee) {
        return c.json({ 
          error: 'Sin acceso a este negocio',
          code: 'BUSINESS_ACCESS_DENIED',
          details: `Usuario ${user?.email || 'unknown'} no es empleado activo del negocio ${businessId}`
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

      console.log(`✅ Auth success: ${user?.email || 'unknown'} (${employee.role}) -> ${business.name}`);

    } else {
      c.set('user', user);
      console.log(`✅ Auth success: ${user?.email || 'unknown'} (Sin negocio)`);
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
// EXPORT FUNCTIONS FOR TOKEN MANAGEMENT
// =============================================================================

// Export functions for use in other parts of the application
export const markAccountAsCompromised = (userId: string, reason: string, markedBy: string) => {
  tokenService.markAccountAsCompromised(userId, reason, markedBy);
};

export const blacklistToken = (token: string, reason?: string) => {
  tokenService.blacklistToken(token, reason);
};

export const isAccountCompromised = async (userId: string) => {
  return await tokenService.isAccountCompromisedAsync(userId);
};

export const isTokenBlacklisted = async (token: string) => {
  return await tokenService.isTokenBlacklistedAsync(token);
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
*/