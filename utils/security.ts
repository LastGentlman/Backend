import { Context } from "hono";

// Configuración de seguridad
const SECURITY_CONFIG = {
  MAX_INPUT_LENGTH: 1000,
  ALLOWED_HTML_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'span'],
  FORBIDDEN_PATTERNS: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /vbscript:/gi,
    /data:/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi
  ]
};

// Configuración de CSP mejorada
const CSP_CONFIG = {
  // CSP estricto para producción
  production: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'"], // Permitir inline para React
    'style-src': ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    'img-src': ["'self'", "data:", "https:", "blob:"],
    'font-src': ["'self'", "data:", "https://fonts.gstatic.com"],
    'connect-src': ["'self'", "https:", "wss:"],
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'upgrade-insecure-requests': [],
    'block-all-mixed-content': [],
    'require-trusted-types-for': ["'script'"]
  },
  // CSP más permisivo para desarrollo
  development: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", "data:", "https:", "blob:"],
    'font-src': ["'self'", "data:"],
    'connect-src': ["'self'", "https:", "wss:", "http://localhost:*"],
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"]
  }
};

/**
 * Log de intentos de XSS
 */
export function logXSSAttempt(
  payload: string, 
  source: string, 
  context: string,
  ip?: string,
  userAgent?: string
) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    type: 'XSS_ATTEMPT',
    payload: payload.substring(0, 200), // Limitar longitud del payload
    source,
    context,
    ip: ip || 'unknown',
    userAgent: userAgent || 'unknown',
    severity: 'HIGH'
  };
  
  // Log estructurado para monitoreo
  console.error(`🚨 XSS ATTEMPT DETECTED:`, JSON.stringify(logEntry, null, 2));
  
  // Log adicional para debugging
  console.error(`🔒 XSS Blocked - Source: ${source}, Context: ${context}`);
  console.error(`📝 Payload: ${payload.substring(0, 100)}${payload.length > 100 ? '...' : ''}`);
  console.error(`🌐 IP: ${ip || 'unknown'}, User-Agent: ${userAgent || 'unknown'}`);
}

function stripHTMLTags(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Sanitiza texto para prevenir XSS
 */
export function sanitizeText(text: string, context: string = 'unknown', source: string = 'unknown'): string {
  if (!text || typeof text !== 'string') return '';
  // XSS detection and logging (as before)
  const hasDangerousContent = SECURITY_CONFIG.FORBIDDEN_PATTERNS.some(pattern => 
    pattern.test(text)
  );
  if (hasDangerousContent) {
    logXSSAttempt(text, source, context);
    return '[CONTENIDO BLOQUEADO]';
  }
  // Remove all HTML tags
  const noTags = stripHTMLTags(text);
  // Escape any remaining special chars
  return noTags
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitiza HTML permitiendo solo tags seguros
 */
export function sanitizeHTML(html: string, context: string = 'unknown', source: string = 'unknown'): string {
  if (!html || typeof html !== 'string') return '';
  // XSS detection and logging (as before)
  const hasDangerousContent = SECURITY_CONFIG.FORBIDDEN_PATTERNS.some(pattern => 
    pattern.test(html)
  );
  if (hasDangerousContent) {
    logXSSAttempt(html, source, context);
    return '[CONTENIDO BLOQUEADO]';
  }
  // Remove all HTML tags
  const noTags = stripHTMLTags(html);
  // Escape any remaining special chars
  return noTags
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Valida y sanitiza URLs
 */
export function sanitizeURL(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  try {
    const parsed = new URL(url);
    // Solo permitir protocolos seguros
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

/**
 * Sanitiza datos de entrada de formularios
 */
export function sanitizeFormData(data: Record<string, unknown>, context: string = 'form'): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeText(value, context, `form_field_${key}`);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeFormData(value as Record<string, unknown>, `${context}_${key}`);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Middleware para sanitizar datos de entrada
 */
export function sanitizeInputMiddleware() {
  return async (c: Context, next: () => Promise<void>) => {
    const originalJson = c.req.json;
    
    c.req.json = async <T = unknown>(): Promise<T> => {
      const data = await originalJson.call(c.req);
      return sanitizeFormData(data as Record<string, unknown>) as T;
    };
    
    await next();
  };
}

/**
 * Valida que un string no contenga contenido peligroso
 */
export function containsDangerousContent(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  return SECURITY_CONFIG.FORBIDDEN_PATTERNS.some(pattern => 
    pattern.test(text)
  );
}

/**
 * Valida email de forma segura
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailPattern.test(email) && !containsDangerousContent(email);
}

/**
 * Valida teléfono de forma segura
 */
export function validatePhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  // Solo números, espacios, guiones, paréntesis y +
  const phonePattern = /^[\d\s\-\(\)\+]+$/;
  return phonePattern.test(phone) && phone.length <= 20;
}

/**
 * Genera CSP header basado en el ambiente
 */
export function generateCSPHeader(isProduction: boolean = false): string {
  const config = isProduction ? CSP_CONFIG.production : CSP_CONFIG.development;
  
  const directives = Object.entries(config).map(([directive, sources]) => {
    if (Array.isArray(sources) && sources.length > 0) {
      return `${directive} ${sources.join(' ')}`;
    } else if (Array.isArray(sources) && sources.length === 0) {
      return directive;
    }
    return '';
  }).filter(Boolean);
  
  return directives.join('; ');
}

/**
 * Headers de seguridad recomendados
 */
export function getSecurityHeaders(isProduction: boolean = false): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': generateCSPHeader(isProduction),
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin'
  };
}

/**
 * Middleware para agregar headers de seguridad
 */
export function securityHeadersMiddleware(isProduction: boolean = false) {
  return async (c: Context, next: () => Promise<void>) => {
    const headers = getSecurityHeaders(isProduction);
    
    Object.entries(headers).forEach(([key, value]) => {
      c.header(key, value);
    });
    
    await next();
  };
} 