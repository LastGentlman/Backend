// ===== VALIDACIÓN CENTRALIZADA DE VARIABLES DE ENTORNO =====

import { AppError, ErrorCode } from "../types/app.ts";

/**
 * Valida que las variables de entorno requeridas estén presentes
 * @param requiredVars Array de nombres de variables de entorno requeridas
 * @throws AppError si alguna variable está faltando
 */
export function validateRequiredEnvVars(requiredVars: string[]): void {
  const missing = requiredVars.filter(name => !Deno.env.get(name));
  if (missing.length > 0) {
    const errorMessage = `Missing required environment variables: ${missing.join(', ')}`;
    throw new AppError(
      errorMessage,
      500,
      'MISSING_ENV_VARS'
    );
  }
}

/**
 * Valida variables de entorno específicas para producción
 * @param config Configuración de la aplicación
 * @throws AppError si alguna variable crítica está faltando en producción
 */
export function validateProductionEnv(config: {
  IS_PRODUCTION: boolean;
  SUPABASE_URL: string | undefined;
  SUPABASE_ANON_KEY: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY: string | undefined;
}): void {
  if (config.IS_PRODUCTION) {
    const requiredFields = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY', 
      'SUPABASE_SERVICE_ROLE_KEY'
    ] as const;
    
    const missingFields = requiredFields.filter(field => !config[field]);
    
    if (missingFields.length > 0) {
      const errorMessage = `Missing required environment variables: ${missingFields.join(", ")}`;
      console.error("❌", errorMessage);
      throw new AppError(
        errorMessage,
        500,
        'MISSING_ENV_VARS'
      );
    }
  }
}

/**
 * Valida que un puerto sea válido
 * @param port Puerto a validar
 * @returns Puerto validado
 * @throws AppError si el puerto no es válido
 */
export function validatePort(port: string | undefined, defaultPort: number = 3030): number {
  if (!port) return defaultPort;
  
  const parsedPort = parseInt(port, 10);
  
  if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new AppError(
      `Invalid port: ${port}. Must be a number between 1 and 65535`,
      500,
      'VALIDATION_ERROR'
    );
  }
  
  return parsedPort;
}

/**
 * Valida que una URL sea válida
 * @param url URL a validar
 * @param name Nombre de la variable para el error
 * @returns URL validada
 * @throws AppError si la URL no es válida
 */
export function validateUrl(url: string | undefined, name: string): string {
  if (!url) {
    throw new AppError(
      `Missing required URL: ${name}`,
      500,
      'MISSING_ENV_VARS'
    );
  }
  
  try {
    new URL(url);
    return url;
  } catch {
    throw new AppError(
      `Invalid URL format for ${name}: ${url}`,
      500,
      'VALIDATION_ERROR'
    );
  }
}

/**
 * Valida que una clave de API sea válida
 * @param key Clave a validar
 * @param name Nombre de la variable para el error
 * @returns Clave validada
 * @throws AppError si la clave no es válida
 */
export function validateApiKey(key: string | undefined, name: string): string {
  if (!key) {
    throw new AppError(
      `Missing required API key: ${name}`,
      500,
      'MISSING_ENV_VARS'
    );
  }
  
  if (key.length < 10) {
    throw new AppError(
      `Invalid API key format for ${name}: too short`,
      500,
      'VALIDATION_ERROR'
    );
  }
  
  return key;
}

/**
 * Crea configuración de aplicación con validación completa
 * @returns Configuración validada
 */
export function createValidatedConfig() {
  const isProduction = Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined;
  
  const config = {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    IS_PRODUCTION: isProduction,
    PORT: validatePort(Deno.env.get("PORT"), 3030),
  };
  
  // Validar variables críticas en producción
  validateProductionEnv(config);
  
  return config;
}
