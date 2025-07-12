import { Context, Next } from "https://deno.land/x/hono@v3.12.0/mod.ts";
import { errorLogger } from "./logger.ts";

/**
 * Patrones sospechosos que podrían indicar intentos de SQL injection
 */
const SUSPICIOUS_PATTERNS = [
  // SQL keywords en contexto sospechoso
  /\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b/i,
  
  // Comentarios SQL
  /(--|\/\*|\*\/)/,
  
  // Caracteres de escape y terminación
  /(;|'|"|`)/,
  
  // Scripts maliciosos
  /(javascript:|vbscript:|data:text\/html)/i,
  
  // Patrones de inyección comunes
  /(\b(1=1|1'='1|'or'1'='1|'or'1=1)\b)/i,
  
  // Intentos de bypass
  /(\b(union|select|insert|update|delete|drop|create|alter)\s+all\b)/i,
  
  // Patrones de encoding
  /(%27|%22|%3B|%2D%2D)/i,
  
  // Patrones de concatenación
  /(\|\||&&|\+\+)/,
  
  // Patrones de subqueries
  /(\b(select|insert|update|delete)\s*\(.*\))/i
];

/**
 * Niveles de severidad para actividad sospechosa
 */
export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Interfaz para logs de seguridad
 */
export interface SecurityLog {
  userId?: string;
  ipAddress: string;
  userAgent: string;
  pattern: string;
  input: string;
  severity: SecuritySeverity;
  endpoint: string;
  method: string;
  timestamp: Date;
  blocked: boolean;
}

/**
 * Clase para manejo de logs de seguridad
 */
class SecurityLogger {
  private logs: SecurityLog[] = [];
  private readonly MAX_LOGS = 1000;

  logSuspiciousActivity(log: SecurityLog): void {
    this.logs.push(log);
    
    // Mantener solo los logs más recientes
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS);
    }

    // Log para debugging
    errorLogger({
      type: 'SECURITY_VIOLATION',
      severity: log.severity,
      message: `Suspicious activity detected: ${log.pattern}`,
      details: {
        ip: log.ipAddress,
        userAgent: log.userAgent,
        endpoint: log.endpoint,
        method: log.method,
        blocked: log.blocked
      }
    }, 'SQL Injection Protection');

    // En producción, enviar a sistema de monitoreo
    if (log.severity === SecuritySeverity.CRITICAL) {
      this.sendAlert(log);
    }
  }

  private sendAlert(log: SecurityLog): void {
    // Implementar envío de alertas (email, Slack, etc.)
    console.error('🚨 CRITICAL SECURITY ALERT:', {
      pattern: log.pattern,
      ip: log.ipAddress,
      endpoint: log.endpoint,
      timestamp: log.timestamp
    });
  }

  getRecentLogs(limit: number = 50): SecurityLog[] {
    return this.logs.slice(-limit);
  }

  getLogsBySeverity(severity: SecuritySeverity): SecurityLog[] {
    return this.logs.filter(log => log.severity === severity);
  }

  getStats(): {
    total: number;
    blocked: number;
    bySeverity: Record<SecuritySeverity, number>;
  } {
    const bySeverity = Object.values(SecuritySeverity).reduce((acc, severity) => {
      acc[severity] = this.logs.filter(log => log.severity === severity).length;
      return acc;
    }, {} as Record<SecuritySeverity, number>);

    return {
      total: this.logs.length,
      blocked: this.logs.filter(log => log.blocked).length,
      bySeverity
    };
  }
}

export const securityLogger = new SecurityLogger();

/**
 * Sanitiza entrada de texto para prevenir SQL injection
 */
export function sanitizeInput(input: string, context: string = 'unknown'): string {
  if (!input || typeof input !== 'string') return '';

  // Decodificar entidades HTML
  const decoded = decodeURIComponent(input);

  // Verificar patrones sospechosos
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(decoded)) {
      securityLogger.logSuspiciousActivity({
        userId: undefined,
        ipAddress: 'unknown',
        userAgent: 'unknown',
        pattern: pattern.source,
        input: decoded,
        severity: SecuritySeverity.HIGH,
        endpoint: context,
        method: 'sanitize',
        timestamp: new Date(),
        blocked: true
      });
      
      return '[CONTENIDO BLOQUEADO]';
    }
  }

  // Sanitización básica
  return decoded
    .replace(/[<>"'&;]/g, '')
    .replace(/\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b/gi, '')
    .trim();
}

/**
 * Valida que un UUID sea válido
 */
export function validateUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Valida que un ID numérico sea seguro
 */
export function validateNumericId(id: string | number): boolean {
  const num = Number(id);
  return !isNaN(num) && num > 0 && num <= Number.MAX_SAFE_INTEGER;
}

/**
 * Middleware para protección contra SQL injection
 */
export function sqlInjectionProtection() {
  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    
    try {
      // Obtener información de la request
      const ipAddress = c.req.header('x-forwarded-for') || 
                       c.req.header('x-real-ip') || 
                       'unknown';
      const userAgent = c.req.header('user-agent') || 'unknown';
      const method = c.req.method;
      const endpoint = c.req.path;

      // Verificar body de la request
      let body = {};
      try {
        if (method !== 'GET' && method !== 'HEAD') {
          body = await c.req.json().catch(() => ({}));
        }
      } catch {
        // Ignorar errores de parsing JSON
      }

      // Verificar query parameters
      const query = c.req.query();

      // Combinar todos los inputs para análisis
      const allInputs = JSON.stringify({ body, query });
      const allInputsLower = allInputs.toLowerCase();

      // Verificar patrones sospechosos
      let detectedPattern = '';
      let severity = SecuritySeverity.LOW;

      for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(allInputsLower)) {
          detectedPattern = pattern.source;
          
          // Determinar severidad basada en el patrón
          if (pattern.source.includes('union') || pattern.source.includes('drop')) {
            severity = SecuritySeverity.CRITICAL;
          } else if (pattern.source.includes('select') || pattern.source.includes('insert')) {
            severity = SecuritySeverity.HIGH;
          } else if (pattern.source.includes('--') || pattern.source.includes('/*')) {
            severity = SecuritySeverity.MEDIUM;
          }
          
          break;
        }
      }

      // Si se detectó actividad sospechosa
      if (detectedPattern) {
        const log: SecurityLog = {
          userId: undefined, // Se puede obtener del contexto de auth
          ipAddress,
          userAgent,
          pattern: detectedPattern,
          input: allInputs.substring(0, 500), // Limitar tamaño del log
          severity,
          endpoint,
          method,
          timestamp: new Date(),
          blocked: severity === SecuritySeverity.CRITICAL || severity === SecuritySeverity.HIGH
        };

        securityLogger.logSuspiciousActivity(log);

        // Bloquear requests críticas o de alta severidad
        if (log.blocked) {
          return c.json({
            error: 'Actividad sospechosa detectada',
            code: 'SECURITY_VIOLATION',
            message: 'Tu request ha sido bloqueada por motivos de seguridad'
          }, 400);
        }
      }

      // Continuar con la request
      await next();

      // Log de performance
      const duration = Date.now() - startTime;
      if (duration > 1000) { // Log requests lentas
        errorLogger({
          type: 'SLOW_REQUEST',
          message: `Slow request detected: ${endpoint}`,
          details: {
            duration,
            method,
            endpoint,
            ipAddress
          }
        }, 'SQL Injection Protection');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errorLogger({
        type: 'MIDDLEWARE_ERROR',
        message: 'Error in SQL injection protection middleware',
        details: {
          error: errorMessage,
          endpoint: c.req.path,
          method: c.req.method
        }
      }, 'SQL Injection Protection');
      
      // Continuar con la request en caso de error
      await next();
    }
  };
}

/**
 * Función helper para validar parámetros de query
 */
export function validateQueryParams(params: Record<string, unknown>): {
  isValid: boolean;
  errors: string[];
  sanitized: Record<string, unknown>;
} {
  const errors: string[] = [];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      const sanitizedValue = sanitizeInput(value, `query.${key}`);
      
      if (sanitizedValue === '[CONTENIDO BLOQUEADO]') {
        errors.push(`Parámetro '${key}' contiene contenido sospechoso`);
        continue;
      }
      
      sanitized[key] = sanitizedValue;
    } else {
      sanitized[key] = value;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Función helper para validar body de request
 */
export function validateRequestBody(body: Record<string, unknown>): {
  isValid: boolean;
  errors: string[];
  sanitized: Record<string, unknown>;
} {
  const errors: string[] = [];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      const sanitizedValue = sanitizeInput(value, `body.${key}`);
      if (sanitizedValue === '[CONTENIDO BLOQUEADO]') {
        errors.push(`Campo '${key}' contiene contenido sospechoso`);
        continue;
      }
      sanitized[key] = sanitizedValue;
    } else if (typeof value === 'object' && value !== null) {
      // Recursively validate nested objects, but always include the sanitized version
      const nestedValidation = validateRequestBody(value as Record<string, unknown>);
      if (!nestedValidation.isValid) {
        errors.push(...nestedValidation.errors.map(err => `${key}.${err}`));
      }
      sanitized[key] = nestedValidation.sanitized;
    } else {
      sanitized[key] = value;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Función para obtener estadísticas de seguridad
 */
export function getSecurityStats() {
  return securityLogger.getStats();
}

/**
 * Función para obtener logs recientes de seguridad
 */
export function getSecurityLogs(limit: number = 50) {
  return securityLogger.getRecentLogs(limit);
} 