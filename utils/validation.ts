import { z } from "zod";

// ===== SCHEMAS DE VALIDACIÓN =====

// Schema para activación de trial
export const trialActivationSchema = z.object({
  businessName: z.string()
    .min(2, "El nombre del negocio debe tener al menos 2 caracteres")
    .max(100, "El nombre del negocio no puede exceder 100 caracteres")
    .regex(/^[a-zA-Z0-9\s\-_\.]+$/, "El nombre del negocio solo puede contener letras, números, espacios, guiones, guiones bajos y puntos"),
  
  businessEmail: z.string()
    .email("Email de negocio inválido")
    .max(255, "El email no puede exceder 255 caracteres"),
  
  businessPhone: z.string()
    .max(20, "El teléfono no puede exceder 20 caracteres")
    .optional()
    .refine((val: string | undefined) => !val || validatePhone(val), {
      message: "El teléfono debe tener un formato válido para los países soportados"
    }),
  
  businessAddress: z.string()
    .max(500, "La dirección no puede exceder 500 caracteres")
    .optional(),
  
  billingName: z.string()
    .min(2, "El nombre de facturación debe tener al menos 2 caracteres")
    .max(100, "El nombre de facturación no puede exceder 100 caracteres"),
  
  billingAddress: z.string()
    .max(500, "La dirección de facturación no puede exceder 500 caracteres")
    .optional(),
  
  taxId: z.string()
    .optional()
    .refine((val: string | undefined) => !val || /^[A-Z0-9]{10,18}$/.test(val), {
      message: "RFC inválido (debe tener entre 10 y 18 caracteres alfanuméricos)"
    }),
  
  taxRegime: z.enum(["605", "606", "612", "621", "626", "601", "614", "623", "999"], {
    errorMap: () => ({ message: "Régimen fiscal inválido" })
  }),
  
  currency: z.enum(["MXN", "USD"], {
    errorMap: () => ({ message: "Moneda inválida. Solo se permiten: MXN, USD" })
  }).default("MXN"),
  
  // Trial dinámico (opcional, para casos especiales como consultorías)
  trialDays: z.number()
    .min(1, "El trial debe ser de al menos 1 día")
    .max(365, "El trial no puede exceder 365 días")
    .optional(),
  
  paymentMethod: z.object({
    type: z.enum(["card"], {
      errorMap: () => ({ message: "Tipo de método de pago inválido" })
    }),
    card: z.object({
      number: z.string()
        .regex(/^\d{13,19}$/, "Número de tarjeta inválido"),
      exp_month: z.number()
        .min(1, "Mes de expiración inválido")
        .max(12, "Mes de expiración inválido"),
      exp_year: z.number()
        .min(new Date().getFullYear(), "Año de expiración inválido")
        .max(new Date().getFullYear() + 20, "Año de expiración inválido"),
      cvc: z.string()
        .regex(/^\d{3,4}$/, "CVC inválido")
    }).optional()
  }).optional()
});

// Schema para invitación de empleados
export const employeeInvitationSchema = z.object({
  email: z.string()
    .email("Email inválido")
    .max(255, "El email no puede exceder 255 caracteres")
    .toLowerCase(),
  
  role: z.enum(["admin", "seller"], {
    errorMap: () => ({ message: "Rol inválido. Solo se permiten: admin, seller" })
  })
});

// Schema para actualización de configuración de negocio
export const businessSettingsUpdateSchema = z.object({
  name: z.string()
    .min(2, "El nombre del negocio debe tener al menos 2 caracteres")
    .max(100, "El nombre del negocio no puede exceder 100 caracteres")
    .regex(/^[a-zA-Z0-9\s\-_\.]+$/, "El nombre del negocio solo puede contener letras, números, espacios, guiones, guiones bajos y puntos")
    .optional(),
  
  settings: z.object({
    currency: z.enum(["MXN", "USD"]).optional(),
    taxRegime: z.object({
      code: z.string(),
      name: z.string(),
      type: z.string()
    }).optional(),
    notifications: z.object({
      email: z.boolean().optional(),
      push: z.boolean().optional()
    }).optional(),
    timezone: z.string().optional()
  }).optional()
});

// ===== SCHEMAS PARA CÓDIGOS DE INVITACIÓN =====

// Schema para crear código de invitación
export const createInvitationCodeSchema = z.object({
  business_id: z.string().uuid("ID de negocio inválido"),
  role: z.enum(["admin", "seller"], {
    errorMap: () => ({ message: "Rol inválido. Solo se permiten: admin, seller" })
  }),
  max_uses: z.number()
    .min(1, "El número máximo de usos debe ser al menos 1")
    .max(100, "El número máximo de usos no puede exceder 100")
    .default(1),
  expires_in_hours: z.number()
    .min(1, "La expiración debe ser al menos 1 hora")
    .max(720, "La expiración no puede exceder 30 días (720 horas)")
    .default(24),
  notes: z.string()
    .max(500, "Las notas no pueden exceder 500 caracteres")
    .optional()
});

// Schema para unirse a un negocio
export const joinBusinessSchema = z.object({
  businessCode: z.string()
    .length(11, "El código debe tener exactamente 11 caracteres")
    .regex(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/, "El código debe tener el formato XXX-XXX-XXX")
});

// Schema para actualizar código de invitación
export const updateInvitationCodeSchema = z.object({
  status: z.enum(["active", "disabled"], {
    errorMap: () => ({ message: "Estado inválido. Solo se permiten: active, disabled" })
  }).optional(),
  max_uses: z.number()
    .min(1, "El número máximo de usos debe ser al menos 1")
    .max(100, "El número máximo de usos no puede exceder 100")
    .optional(),
  expires_in_hours: z.number()
    .min(1, "La expiración debe ser al menos 1 hora")
    .max(720, "La expiración no puede exceder 30 días (720 horas)")
    .optional(),
  notes: z.string()
    .max(500, "Las notas no pueden exceder 500 caracteres")
    .optional()
});

// Schema para validación de UUID
export const uuidSchema = z.string()
  .uuid("ID inválido");

// Schema para validación de paginación
export const paginationSchema = z.object({
  page: z.number()
    .min(1, "La página debe ser mayor a 0")
    .default(1),
  
  limit: z.number()
    .min(1, "El límite debe ser mayor a 0")
    .max(100, "El límite no puede exceder 100")
    .default(20)
});

// Schema para items de orden
export const orderItemSchema = z.object({
  product_id: z.string().optional(),
  product_name: z.string().min(1, "El nombre del producto es requerido"),
  quantity: z.number().min(1, "La cantidad debe ser mayor a 0"),
  unit_price: z.number().min(0, "El precio unitario no puede ser negativo"),
  notes: z.string().max(500).optional()
});

// Schema para crear orden
export const createOrderSchema = z.object({
  client_name: z.string().min(2, "El nombre del cliente debe tener al menos 2 caracteres").max(100),
  client_phone: z.string()
    .max(20, "El teléfono no puede exceder 20 caracteres")
    .optional()
    .refine((val: string | undefined) => !val || validatePhone(val), {
      message: "El teléfono debe tener exactamente 7 dígitos numéricos"
    }),
  delivery_date: z.string().min(8, "La fecha de entrega es requerida"),
  delivery_time: z.string().max(10).optional(),
  notes: z.string().max(500).optional(),
  items: z.array(orderItemSchema).min(1, "Debe haber al menos un producto en la orden")
});

// Schema para actualizar orden
export const updateOrderSchema = z.object({
  status: z.enum(["pending", "preparing", "ready", "delivered", "cancelled"]).optional(),
  notes: z.string().max(500).optional(),
  delivery_date: z.string().optional(),
  delivery_time: z.string().optional()
});

// Schema para sincronización de órdenes offline
export const offlineOrderSchema = createOrderSchema.extend({
  clientGeneratedId: z.string().optional(),
  syncStatus: z.enum(["pending", "synced", "error"]).optional()
});

export const syncOrdersSchema = z.object({
  orders: z.array(offlineOrderSchema)
});

// ===== FUNCIONES DE VALIDACIÓN =====

/**
 * Valida datos usando un schema de Zod y retorna el resultado
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return { success: false, errors: result.error };
}

/**
 * Valida datos y lanza error si es inválido
 */
export function validateDataOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Sanitiza y valida un string para prevenir XSS
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remover < y > para prevenir XSS básico
    .replace(/\s+/g, ' '); // Normalizar espacios
}

/**
 * Valida y sanitiza un email
 */
export function validateAndSanitizeEmail(email: string): string | null {
  const sanitized = sanitizeString(email).toLowerCase();
  const emailSchema = z.string().email();
  
  try {
    emailSchema.parse(sanitized);
    return sanitized;
  } catch {
    return null;
  }
}

/**
 * Valida una URL
 */
export function validateUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // Solo permitir http y https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Valida un número de teléfono mexicano e internacional con mejor manejo de errores
 */
export function validatePhone(phone: string): boolean {
  const result = validatePhoneWithDetails(phone);
  return result.isValid;
}

/**
 * Valida un número de teléfono mexicano e internacional con detalles del error
 */
export function validatePhoneWithDetails(phone: string): {
  isValid: boolean;
  reason?: string;
  cleanNumber?: string;
  suggestedFormat?: string;
  countryCode?: string;
  isInternational?: boolean;
} {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, reason: 'Número vacío o inválido' };
  }

  const cleanPhone = phone.replace(/\D/g, '');
  
  if (cleanPhone.length === 0) {
    return { isValid: false, reason: 'Número vacío' };
  }
  
  // ===== VALIDACIÓN DE NÚMEROS MEXICANOS =====
  
  // Número local mexicano (10 dígitos)
  if (/^[1-9][0-9]{9}$/.test(cleanPhone)) {
    return { 
      isValid: true, 
      cleanNumber: cleanPhone,
      suggestedFormat: `+52 ${cleanPhone.slice(0, 3)} ${cleanPhone.slice(3, 6)} ${cleanPhone.slice(6)}`,
      countryCode: 'MX',
      isInternational: false
    };
  }
  
  // Número con prefijo 55 (México - 12 dígitos: 55 + 10)
  if (/^55[1-9][0-9]{9}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(2); // Remover prefijo 55
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+52 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`,
      countryCode: 'MX',
      isInternational: false
    };
  }
  
  // Número con prefijo 52 (México - 12 dígitos: 52 + 10)
  if (/^52[1-9][0-9]{9}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(2); // Remover prefijo 52
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+52 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`,
      countryCode: 'MX',
      isInternational: false
    };
  }
  
  // ===== VALIDACIÓN DE NÚMEROS INTERNACIONALES =====
  
  // Estados Unidos/Canadá (10 dígitos con prefijo 1)
  if (/^1[0-9]{9}$/.test(cleanPhone)) {
    return { 
      isValid: true, 
      cleanNumber: cleanPhone,
      suggestedFormat: `+1 ${cleanPhone.slice(1, 4)} ${cleanPhone.slice(4, 7)} ${cleanPhone.slice(7)}`,
      countryCode: 'US',
      isInternational: true
    };
  }
  
  // Estados Unidos/Canadá (11 dígitos con prefijo 1)
  if (/^1[0-9]{10}$/.test(cleanPhone)) {
    return { 
      isValid: true, 
      cleanNumber: cleanPhone,
      suggestedFormat: `+1 ${cleanPhone.slice(1, 4)} ${cleanPhone.slice(4, 7)} ${cleanPhone.slice(7)}`,
      countryCode: 'US',
      isInternational: true
    };
  }
  
  // ===== LATINOAMÉRICA =====
  
  // Ecuador (8 dígitos con prefijo 593)
  if (/^593[0-9]{8}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(3);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+593 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`,
      countryCode: 'EC',
      isInternational: true
    };
  }
  
  // Bolivia (7 dígitos con prefijo 591)
  if (/^591[0-9]{7}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(3);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+591 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 5)} ${localNumber.slice(5)}`,
      countryCode: 'BO',
      isInternational: true
    };
  }
  
  // Paraguay (8 dígitos con prefijo 595)
  if (/^595[0-9]{8}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(3);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+595 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`,
      countryCode: 'PY',
      isInternational: true
    };
  }
  
  // Uruguay (7 dígitos con prefijo 598)
  if (/^598[0-9]{7}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(3);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+598 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 5)} ${localNumber.slice(5)}`,
      countryCode: 'UY',
      isInternational: true
    };
  }
  
  // Guatemala (7 dígitos con prefijo 502)
  if (/^502[0-9]{7}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(3);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+502 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 5)} ${localNumber.slice(5)}`,
      countryCode: 'GT',
      isInternational: true
    };
  }
  
  // El Salvador (7 dígitos con prefijo 503)
  if (/^503[0-9]{7}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(3);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+503 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 5)} ${localNumber.slice(5)}`,
      countryCode: 'SV',
      isInternational: true
    };
  }
  
  // Honduras (7 dígitos con prefijo 504)
  if (/^504[0-9]{7}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(3);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+504 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 5)} ${localNumber.slice(5)}`,
      countryCode: 'HN',
      isInternational: true
    };
  }
  
  // Nicaragua (7 dígitos con prefijo 505)
  if (/^505[0-9]{7}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(3);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+505 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 5)} ${localNumber.slice(5)}`,
      countryCode: 'NI',
      isInternational: true
    };
  }
  
  // Costa Rica (7 dígitos con prefijo 506)
  if (/^506[0-9]{7}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(3);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+506 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 5)} ${localNumber.slice(5)}`,
      countryCode: 'CR',
      isInternational: true
    };
  }
  
  // Panamá (7 dígitos con prefijo 507)
  if (/^507[0-9]{7}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(3);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+507 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 5)} ${localNumber.slice(5)}`,
      countryCode: 'PA',
      isInternational: true
    };
  }
  
  // Argentina (9 dígitos con prefijo 54)
  if (/^54[0-9]{9}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(2);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+54 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`,
      countryCode: 'AR',
      isInternational: true
    };
  }
  
  // Colombia (9 dígitos con prefijo 57)
  if (/^57[0-9]{9}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(2);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+57 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`,
      countryCode: 'CO',
      isInternational: true
    };
  }
  
  // Perú (9 dígitos con prefijo 51)
  if (/^51[0-9]{9}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(2);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+51 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`,
      countryCode: 'PE',
      isInternational: true
    };
  }
  
  // Chile (9 dígitos con prefijo 56)
  if (/^56[0-9]{9}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(2);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+56 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`,
      countryCode: 'CL',
      isInternational: true
    };
  }
  
  // Brasil (9 dígitos con prefijo 55)
  if (/^55[0-9]{9}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(2);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+55 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`,
      countryCode: 'BR',
      isInternational: true
    };
  }
  
  // Venezuela (9 dígitos con prefijo 58)
  if (/^58[0-9]{9}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(2);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+58 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`,
      countryCode: 'VE',
      isInternational: true
    };
  }
  
  // Cuba (8 dígitos con prefijo 53)
  if (/^53[0-9]{8}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(2);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+53 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 5)} ${localNumber.slice(5)}`,
      countryCode: 'CU',
      isInternational: true
    };
  }
  
  // ===== EUROPA =====
  
  // España (9 dígitos con prefijo 34)
  if (/^34[0-9]{9}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(2);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+34 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`,
      countryCode: 'ES',
      isInternational: true
    };
  }
  
  // Francia (10 dígitos con prefijo 33)
  if (/^33[0-9]{9}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(2);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+33 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`,
      countryCode: 'FR',
      isInternational: true
    };
  }
  
  // Alemania (10 dígitos con prefijo 49)
  if (/^49[0-9]{9}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(2);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+49 ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`,
      countryCode: 'DE',
      isInternational: true
    };
  }
  
  // Reino Unido (10 dígitos con prefijo 44)
  if (/^44[0-9]{10}$/.test(cleanPhone)) {
    const localNumber = cleanPhone.slice(2);
    return { 
      isValid: true, 
      cleanNumber: localNumber,
      suggestedFormat: `+44 ${localNumber.slice(0, 4)} ${localNumber.slice(4, 7)} ${localNumber.slice(7)}`,
      countryCode: 'GB',
      isInternational: true
    };
  }
  
  // ===== VALIDACIÓN FLEXIBLE PARA EXPANSIÓN =====
  
  // Verificar que no empiece con 0 antes de la validación flexible
  if (cleanPhone.startsWith('0')) {
    return { 
      isValid: false, 
      reason: 'No puede empezar con 0', 
      cleanNumber: cleanPhone 
    };
  }
  
  // Si tiene entre 10 y 15 dígitos, intentar extraer un número válido
  // SOLO si no coincide con ninguna validación específica anterior
  // Y solo para números que no empiecen con códigos de país conocidos
  if (cleanPhone.length >= 10 && cleanPhone.length <= 15) {
    // No aplicar validación flexible si empieza con códigos de país conocidos
    // Pero permitir números que ya han sido validados por las reglas específicas
    const knownPrefixes = ['52', '55', '54', '57', '51', '56', '58', '593', '591', '595', '598', '502', '503', '504', '505', '506', '507', '53', '34', '33', '49', '44'];
    const hasKnownPrefix = knownPrefixes.some(prefix => cleanPhone.startsWith(prefix));
    
    if (!hasKnownPrefix) {
      // Intentar extraer los últimos 10 dígitos para México
      const last10Digits = cleanPhone.slice(-10);
      if (/^[1-9][0-9]{9}$/.test(last10Digits)) {
        return { 
          isValid: true, 
          cleanNumber: last10Digits,
          suggestedFormat: `+52 ${last10Digits.slice(0, 3)} ${last10Digits.slice(3, 6)} ${last10Digits.slice(6)}`,
          countryCode: 'MX',
          isInternational: false
        };
      }
      
      // Intentar extraer los últimos 9 dígitos para España
      const last9Digits = cleanPhone.slice(-9);
      if (/^[0-9]{9}$/.test(last9Digits)) {
        return { 
          isValid: true, 
          cleanNumber: last9Digits,
          suggestedFormat: `+34 ${last9Digits.slice(0, 3)} ${last9Digits.slice(3, 6)} ${last9Digits.slice(6)}`,
          countryCode: 'ES',
          isInternational: true
        };
      }
    }
  }
  
  // ===== MANEJO DE ERRORES =====
  
  if (cleanPhone.length < 9) {
    return { 
      isValid: false, 
      reason: `Muy corto (${cleanPhone.length} dígitos, mínimo 9)`, 
      cleanNumber: cleanPhone 
    };
  }
  
  if (cleanPhone.length > 15) {
    return { 
      isValid: false, 
      reason: `Muy largo (${cleanPhone.length} dígitos, máximo 15)`, 
      cleanNumber: cleanPhone 
    };
  }
  
  return { 
    isValid: false, 
    reason: 'Formato inválido para los países soportados', 
    cleanNumber: cleanPhone 
  };
}

/**
 * Valida un RFC mexicano
 */
export function validateMexicanRFC(rfc: string): boolean {
  const rfcRegex = /^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
  return rfcRegex.test(rfc.toUpperCase());
}

// ===== TIPOS INFERIDOS =====

export type TrialActivationRequest = z.infer<typeof trialActivationSchema>;
export type EmployeeInvitationRequest = z.infer<typeof employeeInvitationSchema>;
export type BusinessSettingsUpdateRequest = z.infer<typeof businessSettingsUpdateSchema>; 