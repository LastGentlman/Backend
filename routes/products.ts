import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.ts";
import { validateRequest, getValidatedData } from "../middleware/validation.ts";
import { getSupabaseClient } from "../utils/supabase.ts";
import { getBusinessFromContext, getEmployeeFromContext } from "../types/context.ts";
import { logXSSAttempt } from "../utils/security.ts";

const products = new Hono();

// ===== VALIDATION SCHEMAS =====

const createProductSchema = z.object({
  name: z.string()
    .min(1, "Nombre del producto es requerido")
    .max(255, "Nombre muy largo")
    .trim(),
  price: z.number()
    .positive("Precio debe ser mayor a 0")
    .max(999999.99, "Precio muy alto"),
  category: z.string()
    .max(100, "Categoría muy larga")
    .optional(),
  description: z.string()
    .max(500, "Descripción muy larga")
    .optional(),
});

const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const productQuerySchema = z.object({
  category: z.string().optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
});

// ===== HELPER FUNCTIONS =====

import { Context } from "hono";

function getBusinessFromContextLocal(c: Context) {
  return getBusinessFromContext(c);
}

function getEmployeeFromContextLocal(c: Context) {
  return getEmployeeFromContext(c);
}

// ===== PRODUCT ROUTES =====

/**
 * GET /api/products/:businessId
 * Get all products for a business with optional filtering
 */
products.get("/:businessId", authMiddleware, async (c) => {
  try {
    const businessId = c.req.param("businessId");
    const business = getBusinessFromContextLocal(c);

    // Security: Ensure user can only access their business products
    if (!business || business.id !== businessId) {
      logXSSAttempt(
        `Unauthorized access attempt to business ${businessId}`,
        'products_api',
        'GET_products',
        c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
        c.req.header('user-agent')
      );
      return c.json({ 
        error: "Acceso no autorizado",
        code: "UNAUTHORIZED_BUSINESS_ACCESS"
      }, 403);
    }

    // Validate query parameters
    const queryParams = productQuerySchema.safeParse(
      Object.fromEntries(Object.entries(c.req.query()))
    );

    if (!queryParams.success) {
      return c.json({
        error: "Parámetros de consulta inválidos",
        details: queryParams.error.issues
      }, 400);
    }

    const { category, isActive, search } = queryParams.data;
    const supabase = getSupabaseClient();

    // Build query
    let query = supabase
      .from('products')
      .select('*')
      .eq('business_id', businessId)
      .order('name', { ascending: true });

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }

    if (isActive !== undefined) {
      query = query.eq('is_active', isActive);
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data: products, error } = await query;

    if (error) {
      console.error('Error fetching products:', error);
      return c.json({ 
        error: "Error al obtener productos",
        details: error.message 
      }, 500);
    }

    // Transform to frontend format
    const transformedProducts = products.map(product => ({
      id: product.id,
      businessId: product.business_id,
      name: product.name,
      price: parseFloat(product.price),
      category: product.category,
      isActive: product.is_active,
      createdAt: product.created_at,
      updatedAt: product.created_at, // Using created_at as updated_at for now
      syncStatus: 'synced' as const,
    }));

    return c.json({
      products: transformedProducts,
      count: transformedProducts.length,
      businessId,
    });

  } catch (error) {
    console.error('Unexpected error in GET /products:', error);
    return c.json({ 
      error: "Error interno del servidor",
      details: error instanceof Error ? error.message : "Error desconocido"
    }, 500);
  }
});

/**
 * POST /api/products/:businessId
 * Create a new product
 */
products.post("/:businessId", 
  authMiddleware, 
  validateRequest(createProductSchema), 
  async (c) => {
    try {
      const businessId = c.req.param("businessId");
      const business = getBusinessFromContextLocal(c);
      const employee = getEmployeeFromContextLocal(c);
      const productData = getValidatedData<typeof createProductSchema._type>(c);

      // Security: Ensure user can only create products for their business
      if (!business || business.id !== businessId) {
        logXSSAttempt(
          `Unauthorized access attempt to create product for business ${businessId}`,
          'products_api',
          'POST_products',
          c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
          c.req.header('user-agent')
        );
        return c.json({ 
          error: "Acceso no autorizado",
          code: "UNAUTHORIZED_BUSINESS_ACCESS"
        }, 403);
      }

      // Check if user has permission to create products
      if (employee?.role === 'seller') {
        return c.json({ 
          error: "Permisos insuficientes para crear productos",
          code: "INSUFFICIENT_PERMISSIONS"
        }, 403);
      }

      const supabase = getSupabaseClient();

      // Check if product with same name already exists
      const { data: existingProduct } = await supabase
        .from('products')
        .select('id')
        .eq('business_id', businessId)
        .eq('name', productData.name)
        .single();

      if (existingProduct) {
        return c.json({ 
          error: "Ya existe un producto con ese nombre",
          code: "PRODUCT_NAME_EXISTS"
        }, 409);
      }

      // Create product
      const { data: product, error } = await supabase
        .from('products')
        .insert({
          business_id: businessId,
          name: productData.name,
          price: productData.price,
          category: productData.category,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating product:', error);
        return c.json({ 
          error: "Error al crear producto",
          details: error.message 
        }, 500);
      }

      // Transform to frontend format
      const transformedProduct = {
        id: product.id,
        businessId: product.business_id,
        name: product.name,
        price: parseFloat(product.price),
        category: product.category,
        isActive: product.is_active,
        createdAt: product.created_at,
        updatedAt: product.created_at,
        syncStatus: 'synced' as const,
      };

      return c.json({
        product: transformedProduct,
        message: "Producto creado exitosamente"
      }, 201);

    } catch (error) {
      console.error('Unexpected error in POST /products:', error);
      return c.json({ 
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido"
      }, 500);
    }
  }
);

/**
 * PATCH /api/products/:businessId/:productId
 * Update a product
 */
products.patch("/:businessId/:productId", 
  authMiddleware, 
  validateRequest(updateProductSchema), 
  async (c) => {
    try {
      const businessId = c.req.param("businessId");
      const productId = c.req.param("productId");
      const business = getBusinessFromContext(c);
      const employee = getEmployeeFromContext(c);
      const updateData = getValidatedData<typeof updateProductSchema._type>(c);

      // Security: Ensure user can only update products in their business
      if (!business || business.id !== businessId) {
        logXSSAttempt(
          `Unauthorized access attempt to update product ${productId} for business ${businessId}`,
          'products_api',
          'PATCH_products',
          c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
          c.req.header('user-agent')
        );
        return c.json({ 
          error: "Acceso no autorizado",
          code: "UNAUTHORIZED_BUSINESS_ACCESS"
        }, 403);
      }

      // Check if user has permission to update products
      if (employee?.role === 'seller') {
        return c.json({ 
          error: "Permisos insuficientes para actualizar productos",
          code: "INSUFFICIENT_PERMISSIONS"
        }, 403);
      }

      const supabase = getSupabaseClient();

      // Check if product exists and belongs to the business
      const { data: existingProduct, error: fetchError } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .eq('business_id', businessId)
        .single();

      if (fetchError || !existingProduct) {
        return c.json({ 
          error: "Producto no encontrado",
          code: "PRODUCT_NOT_FOUND"
        }, 404);
      }

      // Check for name conflicts if name is being updated
      if (updateData.name && updateData.name !== existingProduct.name) {
        const { data: nameConflict } = await supabase
          .from('products')
          .select('id')
          .eq('business_id', businessId)
          .eq('name', updateData.name)
          .neq('id', productId)
          .single();

        if (nameConflict) {
          return c.json({ 
            error: "Ya existe un producto con ese nombre",
            code: "PRODUCT_NAME_EXISTS"
          }, 409);
        }
      }

      // Prepare update data
      const updatePayload: Record<string, unknown> = {};
      if (updateData.name !== undefined) updatePayload.name = updateData.name;
      if (updateData.price !== undefined) updatePayload.price = updateData.price;
      if (updateData.category !== undefined) updatePayload.category = updateData.category;
      if (updateData.isActive !== undefined) updatePayload.is_active = updateData.isActive;

      // Update product
      const { data: product, error } = await supabase
        .from('products')
        .update(updatePayload)
        .eq('id', productId)
        .eq('business_id', businessId)
        .select()
        .single();

      if (error) {
        console.error('Error updating product:', error);
        return c.json({ 
          error: "Error al actualizar producto",
          details: error.message 
        }, 500);
      }

      // Transform to frontend format
      const transformedProduct = {
        id: product.id,
        businessId: product.business_id,
        name: product.name,
        price: parseFloat(product.price),
        category: product.category,
        isActive: product.is_active,
        createdAt: product.created_at,
        updatedAt: product.created_at,
        syncStatus: 'synced' as const,
      };

      return c.json({
        product: transformedProduct,
        message: "Producto actualizado exitosamente"
      });

    } catch (error) {
      console.error('Unexpected error in PATCH /products:', error);
      return c.json({ 
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido"
      }, 500);
    }
  }
);

/**
 * DELETE /api/products/:businessId/:productId
 * Soft delete a product (set is_active to false)
 */
products.delete("/:businessId/:productId", authMiddleware, async (c) => {
  try {
    const businessId = c.req.param("businessId");
    const productId = c.req.param("productId");
    const business = getBusinessFromContext(c);
    const employee = getEmployeeFromContext(c);

    // Security: Ensure user can only delete products in their business
    if (!business || business.id !== businessId) {
      logXSSAttempt(
        `Unauthorized access attempt to delete product ${productId} for business ${businessId}`,
        'products_api',
        'DELETE_products',
        c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
        c.req.header('user-agent')
      );
      return c.json({ 
        error: "Acceso no autorizado",
        code: "UNAUTHORIZED_BUSINESS_ACCESS"
      }, 403);
    }

    // Check if user has permission to delete products
    if (employee?.role === 'seller') {
      return c.json({ 
        error: "Permisos insuficientes para eliminar productos",
        code: "INSUFFICIENT_PERMISSIONS"
      }, 403);
    }

    const supabase = getSupabaseClient();

    // Check if product exists and belongs to the business
    const { data: existingProduct, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('business_id', businessId)
      .single();

    if (fetchError || !existingProduct) {
      return c.json({ 
        error: "Producto no encontrado",
        code: "PRODUCT_NOT_FOUND"
      }, 404);
    }

    // Soft delete (set is_active to false)
    const { error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', productId)
      .eq('business_id', businessId);

    if (error) {
      console.error('Error deleting product:', error);
      return c.json({ 
        error: "Error al eliminar producto",
        details: error.message 
      }, 500);
    }

    return c.json({
      message: "Producto eliminado exitosamente",
      productId
    });

  } catch (error) {
    console.error('Unexpected error in DELETE /products:', error);
    return c.json({ 
      error: "Error interno del servidor",
      details: error instanceof Error ? error.message : "Error desconocido"
    }, 500);
  }
});

export default products; 