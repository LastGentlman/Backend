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
    .refine((val: string | undefined) => !val || /^[\+]?[1-9][\d]{0,15}$/.test(val), {
      message: "Número de teléfono inválido"
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
  client_phone: z.string().max(20).optional(),
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
 * Valida un número de teléfono mexicano
 */
export function validateMexicanPhone(phone: string): boolean {
  const phoneRegex = /^(\+52|52)?[1-9][0-9]{9}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
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