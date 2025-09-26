import { Context, Next } from "hono";

export interface AppError extends Error {
  status?: number;
  code?: string;
}

export function createError(message: string, status: number = 500, code?: string): AppError {
  const error = new Error(message) as AppError;
  error.status = status;
  error.code = code;
  
  // Asegurar que las propiedades sean enumerables
  Object.defineProperty(error, 'status', {
    value: status,
    writable: true,
    enumerable: true,
    configurable: true
  });
  
  if (code) {
    Object.defineProperty(error, 'code', {
      value: code,
      writable: true,
      enumerable: true,
      configurable: true
    });
  }
  
  return error;
}

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    console.error("❌ Unhandled error:", error);

    // Log estructurado para debugging
    const errorLog = {
      timestamp: new Date().toISOString(),
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('user-agent'),
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: c.get('user')?.id,
      businessId: c.get('business')?.id
    };

    console.error('📋 Error details:', JSON.stringify(errorLog, null, 2));

    // Determinar el status y mensaje del error
    let status = 500;
    let message = "Internal server error";
    let code = 'INTERNAL_SERVER_ERROR';

    if (error && typeof error === 'object') {
      // Intentar obtener propiedades del error
      const appError = error as any;
      
      if (appError.status && typeof appError.status === 'number') {
        status = appError.status;
      }
      
      if (appError.message && typeof appError.message === 'string') {
        message = appError.message;
      }
      
      if (appError.code && typeof appError.code === 'string') {
        code = appError.code;
      }
    }
    
    console.log('🔍 ErrorHandler processing:', { status, code, message });
    console.log('🔍 Error object properties:', { 
      status: (error as any)?.status, 
      code: (error as any)?.code, 
      message: (error as any)?.message,
      hasStatus: 'status' in (error as any),
      hasCode: 'code' in (error as any),
      errorType: typeof error,
      isError: error instanceof Error
    });
    
    return c.json({
      error: message,
      code,
      timestamp: new Date().toISOString()
    }, status);
  }
}

// Middleware para validar JSON
export async function validateJson(c: Context, next: Next) {
  try {
    await c.req.json();
    await next();
  } catch (error) {
    throw createError("Invalid JSON in request body", 400, "INVALID_JSON");
  }
}

// Middleware para manejar errores específicos de Supabase
export function handleSupabaseError(error: any): AppError {
  if (error.code === '23505') { // Unique violation
    return createError('Registro duplicado', 409, 'DUPLICATE_RECORD');
  }
  
  if (error.code === '23503') { // Foreign key violation
    return createError('Referencia inválida', 400, 'INVALID_REFERENCE');
  }
  
  if (error.code === '42P01') { // Table doesn't exist
    return createError('Tabla no encontrada', 500, 'TABLE_NOT_FOUND');
  }
  
  if (error.code === '42703') { // Column doesn't exist
    return createError('Columna no encontrada', 500, 'COLUMN_NOT_FOUND');
  }
  
  // Error por defecto
  return createError(error.message || 'Error de base de datos', 500, 'DATABASE_ERROR');
} 