import { Context, Next } from "hono";
import { z } from "zod";

/**
 * Middleware para validar datos de entrada usando Zod schemas
 */
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.json();
      const result = schema.safeParse(body);
      
      if (!result.success) {
        return c.json({
          error: "Datos de entrada inválidos",
          details: result.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        }, 400);
      }
      
      // Agregar datos validados al contexto
      c.set('validatedData', result.data);
      await next();
    } catch (error) {
      return c.json({
        error: "Error al procesar datos de entrada",
        details: error instanceof Error ? error.message : "Error desconocido"
      }, 400);
    }
  };
}

/**
 * Middleware para validar parámetros de query
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    try {
      const query = c.req.query();
      const result = schema.safeParse(query);
      
      if (!result.success) {
        return c.json({
          error: "Parámetros de query inválidos",
          details: result.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        }, 400);
      }
      
      c.set('validatedQuery', result.data);
      await next();
    } catch (error) {
      return c.json({
        error: "Error al procesar parámetros de query",
        details: error instanceof Error ? error.message : "Error desconocido"
      }, 400);
    }
  };
}

/**
 * Middleware para validar parámetros de URL
 */
export function validateParams<T>(schema: z.ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    try {
      const params = c.req.param();
      const result = schema.safeParse(params);
      
      if (!result.success) {
        return c.json({
          error: "Parámetros de URL inválidos",
          details: result.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        }, 400);
      }
      
      c.set('validatedParams', result.data);
      await next();
    } catch (error) {
      return c.json({
        error: "Error al procesar parámetros de URL",
        details: error instanceof Error ? error.message : "Error desconocido"
      }, 400);
    }
  };
}

/**
 * Función helper para obtener datos validados del contexto
 */
export function getValidatedData<T>(c: Context): T {
  return c.get('validatedData');
}

/**
 * Función helper para obtener query validado del contexto
 */
export function getValidatedQuery<T>(c: Context): T {
  return c.get('validatedQuery');
}

/**
 * Función helper para obtener parámetros validados del contexto
 */
export function getValidatedParams<T>(c: Context): T {
  return c.get('validatedParams');
}