// ===== TIPOS DE CONFIGURACIÓN =====
export interface AppConfig {
  SUPABASE_URL: string | undefined;
  SUPABASE_ANON_KEY: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY: string | undefined;
  IS_PRODUCTION: boolean;
  PORT: number;
}

export interface EnvironmentConfig {
  readonly name: 'development' | 'staging' | 'production';
  readonly cors: {
    readonly origins: string[];
  };
  readonly security: {
    readonly strictCORS: boolean;
  };
  readonly rateLimiting: {
    readonly enabled: boolean;
  };
  readonly logging: {
    readonly detailed: boolean;
  };
}

// ===== TIPOS DE CONTEXTO =====
export interface UserContext {
  id: string;
  email?: string;
  role?: 'admin' | 'user' | 'guest';
  business_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BusinessContext {
  id: string;
  name: string;
  slug?: string;
  owner_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface AppContext {
  user?: UserContext;
  business?: BusinessContext;
  session_id?: string;
  csrf_token?: string;
}

// ===== TIPOS DE ERROR =====
export type ErrorCode = 
  | 'MISSING_ENV_VARS'
  | 'INTERNAL_SERVER_ERROR'
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND'
  | 'DATABASE_ERROR'
  | 'CSRF_ERROR';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly code: ErrorCode = 'INTERNAL_SERVER_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
    
    // Mantiene el stack trace correcto (Deno compatible)
    if ('captureStackTrace' in Error) {
      (Error as any).captureStackTrace(this, AppError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      timestamp: new Date().toISOString()
    };
  }
}

// ===== TIPOS DE RESPUESTA API =====
export interface SuccessResponse<T = unknown> {
  readonly data: T;
  readonly message?: string;
  readonly timestamp: string;
}

export interface ErrorResponse {
  readonly error: string;
  readonly code: ErrorCode;
  readonly timestamp: string;
  readonly stack?: string; // Solo en desarrollo
}

export interface HealthResponse {
  readonly status: 'healthy' | 'error';
  readonly database: 'connected' | 'error';
  readonly timestamp: string;
  readonly environment: string;
  readonly rateLimiting: 'enabled' | 'disabled';
  readonly security: 'strict' | 'permissive';
  readonly version: string;
}

// ===== TIPOS DE MIDDLEWARE =====
export interface AuthenticatedContext extends AppContext {
  user: UserContext; // Required en contexto autenticado
}

export interface CSRFContext extends AppContext {
  csrf_token: string; // Required para operaciones con CSRF
}

// ===== UTILITY TYPES =====
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

// ===== TYPE GUARDS =====
export function isUserContext(obj: unknown): obj is UserContext {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof (obj as { id: unknown }).id === 'string'
  );
}

export function isBusinessContext(obj: unknown): obj is BusinessContext {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj &&
    typeof (obj as { id: unknown; name: unknown }).id === 'string' &&
    typeof (obj as { id: unknown; name: unknown }).name === 'string'
  );
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

// ===== CONSTANTES DE TIPOS =====
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'] as const;
export type HttpMethod = typeof HTTP_METHODS[number];

export const ENVIRONMENTS = ['development', 'staging', 'production'] as const;
export type Environment = typeof ENVIRONMENTS[number];

export const USER_ROLES = ['admin', 'user', 'guest'] as const;
export type UserRole = typeof USER_ROLES[number];
