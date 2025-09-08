import { Hono } from "hono";
import { getSupabaseClient } from '../utils/supabase.ts';
import { authMiddleware } from '../middleware/auth.ts';
import { validatePhone } from '../utils/validation.ts';
import { z } from 'zod';

const clients = new Hono();

// ===== VALIDATION SCHEMAS =====

const createClientSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(255),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string()
    .max(20, "El teléfono debe tener máximo 20 caracteres")
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || validatePhone(val), {
      message: "El teléfono debe tener exactamente 7 dígitos numéricos"
    }),
  address: z.string().max(500, "La dirección debe tener máximo 500 caracteres").optional().or(z.literal("")),
  notes: z.string().max(1000, "Las notas deben tener máximo 1000 caracteres").optional().or(z.literal(""))
});

const updateClientSchema = createClientSchema.partial().extend({
  id: z.string().uuid("ID inválido")
});

// ===== API ROUTES =====

// GET /api/clients - Obtener todos los clientes del negocio
clients.get('/', authMiddleware, async (c) => {
  try {
    const supabase = getSupabaseClient();
    
    // Get user from context (set by authMiddleware)
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Usuario no autenticado' }, 401);
    }

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('business_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (employeeError || !employee) {
      return c.json({ error: 'No tienes acceso a ningún negocio' }, 403);
    }

    // Obtener clientes
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('*')
      .eq('business_id', employee.business_id)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      return c.json({ error: 'Error al obtener clientes' }, 500);
    }

    return c.json(clients || []);
  } catch (error) {
    console.error('Error in GET /api/clients:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// GET /api/clients/:id - Obtener un cliente específico
clients.get('/:id', authMiddleware, async (c) => {
  try {
    const supabase = getSupabaseClient();
    const clientId = c.req.param('id');
    
    // Get user from context (set by authMiddleware)
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Usuario no autenticado' }, 401);
    }

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('business_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (employeeError || !employee) {
      return c.json({ error: 'No tienes acceso a ningún negocio' }, 403);
    }

    // Obtener cliente específico
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('business_id', employee.business_id)
      .eq('is_active', true)
      .single();

    if (clientError) {
      if (clientError.code === 'PGRST116') {
        return c.json({ error: 'Cliente no encontrado' }, 404);
      }
      console.error('Error fetching client:', clientError);
      return c.json({ error: 'Error al obtener cliente' }, 500);
    }

    return c.json(client);
  } catch (error) {
    console.error('Error in GET /api/clients/:id:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// POST /api/clients - Crear un nuevo cliente
clients.post('/', authMiddleware, async (c) => {
  try {
    const supabase = getSupabaseClient();
    const body = await c.req.json();
    
    // Get user from context (set by authMiddleware)
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Usuario no autenticado' }, 401);
    }

    // Validar datos
    const validation = createClientSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ 
        error: 'Datos inválidos',
        details: validation.error.errors 
      }, 400);
    }

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('business_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (employeeError || !employee) {
      return c.json({ error: 'No tienes acceso a ningún negocio' }, 403);
    }

    // Verificar si ya existe un cliente con el mismo nombre
    const { data: existingClient, error: checkError } = await supabase
      .from('clients')
      .select('id')
      .eq('business_id', employee.business_id)
      .eq('name', validation.data.name)
      .eq('is_active', true)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing client:', checkError);
      return c.json({ error: 'Error al verificar cliente existente' }, 500);
    }

    if (existingClient) {
      return c.json({ error: 'Ya existe un cliente con ese nombre' }, 409);
    }

    // Crear cliente
    const newClient = {
      business_id: employee.business_id,
      name: validation.data.name,
      email: validation.data.email || null,
      phone: validation.data.phone || null,
      address: validation.data.address || null,
      notes: validation.data.notes || null
    };

    const { data: client, error: createError } = await supabase
      .from('clients')
      .insert(newClient)
      .select()
      .single();

    if (createError) {
      console.error('Error creating client:', createError);
      return c.json({ error: 'Error al crear cliente' }, 500);
    }

    return c.json(client, 201);
  } catch (error) {
    console.error('Error in POST /api/clients:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// PUT /api/clients/:id - Actualizar un cliente
clients.put('/:id', authMiddleware, async (c) => {
  try {
    const supabase = getSupabaseClient();
    const clientId = c.req.param('id');
    const body = await c.req.json();
    
    // Get user from context (set by authMiddleware)
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Usuario no autenticado' }, 401);
    }

    // Validar datos
    const validation = updateClientSchema.safeParse({ ...body, id: clientId });
    if (!validation.success) {
      return c.json({ 
        error: 'Datos inválidos',
        details: validation.error.errors 
      }, 400);
    }

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('business_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (employeeError || !employee) {
      return c.json({ error: 'No tienes acceso a ningún negocio' }, 403);
    }

    // Verificar que el cliente existe y pertenece al negocio
    const { data: existingClient, error: checkError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .eq('business_id', employee.business_id)
      .eq('is_active', true)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return c.json({ error: 'Cliente no encontrado' }, 404);
      }
      console.error('Error checking client:', checkError);
      return c.json({ error: 'Error al verificar cliente' }, 500);
    }

    // Si se está cambiando el nombre, verificar que no exista otro con el mismo nombre
    if (validation.data.name && validation.data.name !== existingClient.name) {
      const { data: duplicateClient, error: duplicateError } = await supabase
        .from('clients')
        .select('id')
        .eq('business_id', employee.business_id)
        .eq('name', validation.data.name)
        .eq('is_active', true)
        .neq('id', clientId)
        .single();

      if (duplicateError && duplicateError.code !== 'PGRST116') {
        console.error('Error checking duplicate client:', duplicateError);
        return c.json({ error: 'Error al verificar cliente duplicado' }, 500);
      }

      if (duplicateClient) {
        return c.json({ error: 'Ya existe un cliente con ese nombre' }, 409);
      }
    }

    // Actualizar cliente
    const updateData = {
      name: validation.data.name,
      email: validation.data.email || null,
      phone: validation.data.phone || null,
      address: validation.data.address || null,
      notes: validation.data.notes || null
    };

    const { data: client, error: updateError } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', clientId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating client:', updateError);
      return c.json({ error: 'Error al actualizar cliente' }, 500);
    }

    return c.json(client);
  } catch (error) {
    console.error('Error in PUT /api/clients/:id:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// DELETE /api/clients/:id - Eliminar un cliente (soft delete)
clients.delete('/:id', authMiddleware, async (c) => {
  try {
    const supabase = getSupabaseClient();
    const clientId = c.req.param('id');
    
    // Get user from context (set by authMiddleware)
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Usuario no autenticado' }, 401);
    }

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('business_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (employeeError || !employee) {
      return c.json({ error: 'No tienes acceso a ningún negocio' }, 403);
    }

    // Verificar que el cliente existe y pertenece al negocio
    const { data: existingClient, error: checkError } = await supabase
      .from('clients')
      .select('id, name, total_orders')
      .eq('id', clientId)
      .eq('business_id', employee.business_id)
      .eq('is_active', true)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return c.json({ error: 'Cliente no encontrado' }, 404);
      }
      console.error('Error checking client:', checkError);
      return c.json({ error: 'Error al verificar cliente' }, 500);
    }

    // Verificar si el cliente tiene pedidos asociados
    if (existingClient.total_orders > 0) {
      return c.json({ 
        error: 'No se puede eliminar un cliente que tiene pedidos asociados',
        total_orders: existingClient.total_orders
      }, 400);
    }

    // Soft delete del cliente
    const { error: deleteError } = await supabase
      .from('clients')
      .update({ is_active: false })
      .eq('id', clientId);

    if (deleteError) {
      console.error('Error deleting client:', deleteError);
      return c.json({ error: 'Error al eliminar cliente' }, 500);
    }

    return c.json({ message: 'Cliente eliminado exitosamente' });
  } catch (error) {
    console.error('Error in DELETE /api/clients/:id:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// GET /api/clients/stats - Obtener estadísticas de clientes
clients.get('/stats', authMiddleware, async (c) => {
  try {
    const supabase = getSupabaseClient();
    
    // Get user from context (set by authMiddleware)
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Usuario no autenticado' }, 401);
    }

    console.log('🔍 Fetching employee for user:', user.id);

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('business_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (employeeError) {
      console.error('❌ Error fetching employee for user:', user.id, employeeError);
      if (employeeError.code === 'PGRST116') {
        return c.json({ error: 'No tienes acceso a ningún negocio' }, 403);
      }
      return c.json({ error: 'Error al verificar acceso al negocio' }, 500);
    }

    if (!employee) {
      console.error('❌ No employee record found for user:', user.id);
      return c.json({ error: 'No tienes acceso a ningún negocio' }, 403);
    }

    console.log('✅ Employee found:', employee);

    // Obtener estadísticas
    console.log('🔍 Fetching client stats for business:', employee.business_id);
    
    const { data: stats, error: statsError } = await supabase
      .from('clients')
      .select('total_orders, total_spent')
      .eq('business_id', employee.business_id)
      .eq('is_active', true);

    if (statsError) {
      console.error('❌ Error fetching client stats:', statsError);
      return c.json({ error: 'Error al obtener estadísticas' }, 500);
    }

    console.log('✅ Client stats fetched:', stats?.length || 0, 'clients');

    const totalClients = stats?.length || 0;
    const totalOrders = stats?.reduce((acc, client) => acc + (client.total_orders || 0), 0) || 0;
    const totalSpent = stats?.reduce((acc, client) => acc + parseFloat(client.total_spent || '0'), 0) || 0;
    const averageOrders = totalClients > 0 ? (totalOrders / totalClients).toFixed(1) : '0';

    return c.json({
      total_clients: totalClients,
      total_orders: totalOrders,
      total_spent: totalSpent.toFixed(2),
      average_orders: averageOrders
    });
  } catch (error) {
    console.error('Error in GET /api/clients/stats:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

export default clients; 