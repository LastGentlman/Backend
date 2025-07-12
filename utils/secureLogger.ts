interface SensitiveField {
  path: string;
  replacement: string;
}

const SENSITIVE_FIELDS: SensitiveField[] = [
  { path: 'password', replacement: '[PASSWORD_REDACTED]' },
  { path: 'token', replacement: '[TOKEN_REDACTED]' },
  { path: 'apiKey', replacement: '[API_KEY_REDACTED]' },
  { path: 'secret', replacement: '[SECRET_REDACTED]' },
  { path: 'authorization', replacement: '[AUTH_REDACTED]' },
  { path: 'x-csrf-token', replacement: '[CSRF_TOKEN_REDACTED]' },
  { path: 'cookie', replacement: '[COOKIE_REDACTED]' }
];

export function sanitizeLogData(data: unknown): unknown {
  if (typeof data === 'string') {
    return sanitizeString(data);
  }
  
  if (Array.isArray(data)) {
    return data.map(sanitizeLogData);
  }
  
  if (typeof data === 'object' && data !== null) {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      
      // Verificar si es un campo sensible
      const sensitiveField = SENSITIVE_FIELDS.find(field => 
        lowerKey.includes(field.path.toLowerCase())
      );
      
      if (sensitiveField) {
        sanitized[key] = sensitiveField.replacement;
      } else {
        sanitized[key] = sanitizeLogData(value);
      }
    }
    
    return sanitized;
  }
  
  return data;
}

function sanitizeString(str: string): string {
  // Patrones que podrían contener información sensible
  const sensitivePatterns = [
    { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, replacement: 'Bearer [TOKEN_REDACTED]' },
    { pattern: /password["\s]*[:=]["\s]*[^"&\s]+/gi, replacement: 'password=[PASSWORD_REDACTED]' },
    { pattern: /token["\s]*[:=]["\s]*[^"&\s]+/gi, replacement: 'token=[TOKEN_REDACTED]' },
    { pattern: /api_key["\s]*[:=]["\s]*[^"&\s]+/gi, replacement: 'api_key=[API_KEY_REDACTED]' },
    { pattern: /secret["\s]*[:=]["\s]*[^"&\s]+/gi, replacement: 'secret=[SECRET_REDACTED]' }
  ];

  let sanitized = str;
  
  for (const { pattern, replacement } of sensitivePatterns) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  return sanitized;
}

// Logger seguro
export class SecureLogger {
  private static instance: SecureLogger;
  
  public static getInstance(): SecureLogger {
    if (!SecureLogger.instance) {
      SecureLogger.instance = new SecureLogger();
    }
    return SecureLogger.instance;
  }

  logSecurityEvent(event: {
    level: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    data?: unknown;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): void {
    const sanitizedData = event.data ? sanitizeLogData(event.data) : undefined;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: event.level,
      message: event.message,
      userId: event.userId || 'unknown',
      ipAddress: this.sanitizeIpAddress(event.ipAddress || 'unknown'),
      userAgent: this.sanitizeUserAgent(event.userAgent || 'unknown'),
      data: sanitizedData
    };

    // En desarrollo
    if (Deno.env.get("ENVIRONMENT") === "development") {
      console.log(`[${event.level.toUpperCase()}]`, logEntry);
    }
    
    // En producción, enviar a sistema de logging seguro
    this.sendToSecureLogging(logEntry);
  }

  private sanitizeIpAddress(ip: string): string {
    // Para IPv4, mostrar solo los primeros 3 octetos
    const ipv4Regex = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/;
    const match = ip.match(ipv4Regex);
    
    if (match) {
      return `${match[1]}.xxx`;
    }
    
    // Para IPv6 o direcciones no reconocidas
    return ip.length > 10 ? `${ip.substring(0, 10)}...` : ip;
  }

  private sanitizeUserAgent(userAgent: string): string {
    // Mantener información útil pero remover identificadores únicos
    return userAgent
      .replace(/\b\d{10,}\b/g, '[UNIQUE_ID_REDACTED]') // Números largos que podrían ser IDs
      .substring(0, 200); // Limitar longitud
  }

  private sendToSecureLogging(logEntry: unknown): void {
    // TODO: Implementar envío a sistema de logging seguro (Elasticsearch, etc.)
    // Por ahora, solo almacenar localmente en desarrollo
    if (Deno.env.get("ENVIRONMENT") !== "development") {
      // En producción, enviar a sistema externo
      console.log(`[SECURE_LOG] ${JSON.stringify(logEntry)}`);
    }
  }
} 