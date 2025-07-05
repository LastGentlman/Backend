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

/**
 * Sanitiza texto para prevenir XSS
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Limitar longitud
  if (text.length > SECURITY_CONFIG.MAX_INPUT_LENGTH) {
    text = text.substring(0, SECURITY_CONFIG.MAX_INPUT_LENGTH);
  }

  // Remover patrones peligrosos
  let sanitized = text;
  SECURITY_CONFIG.FORBIDDEN_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  // Escapar caracteres HTML
  return sanitized
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
export function sanitizeHTML(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Remover scripts y contenido peligroso
  let sanitized = html;
  SECURITY_CONFIG.FORBIDDEN_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  // Permitir solo tags específicos
  const allowedTags = SECURITY_CONFIG.ALLOWED_HTML_TAGS.join('|');
  const tagPattern = new RegExp(`<(?!\/?(?:${allowedTags})\b)[^>]+>`, 'gi');
  sanitized = sanitized.replace(tagPattern, '');

  return sanitized;
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
export function sanitizeFormData(data: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeText(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeFormData(value);
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
    
    c.req.json = async () => {
      const data = await originalJson.call(c.req);
      return sanitizeFormData(data as Record<string, unknown>);
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
 * Headers de seguridad recomendados
 */
export function getSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
  };
}

/**
 * Middleware para agregar headers de seguridad
 */
export function securityHeadersMiddleware() {
  return async (c: Context, next: () => Promise<void>) => {
    const headers = getSecurityHeaders();
    
    Object.entries(headers).forEach(([key, value]) => {
      c.header(key, value);
    });
    
    await next();
  };
} 