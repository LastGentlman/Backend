import { z } from "zod";
import { createHash, timingSafeEqual as _timingSafeEqualNode } from "node:crypto";

// Schema de validación robusto para contraseñas
export const strongPasswordSchema = z.string()
  .min(12, "La contraseña debe tener al menos 12 caracteres")
  .max(128, "La contraseña no puede exceder 128 caracteres")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/,
    "La contraseña debe incluir: al menos una minúscula, una mayúscula, un número y un símbolo especial (@$!%*?&)"
  )
  .refine((password) => {
    // Verificar que no sea una contraseña común
    const commonPasswords = [
      "123456789012", "password123!", "qwerty123456", 
      "admin123456!", "welcome123456", "Password123!", "password123"
    ];
    return !commonPasswords.some(common => password.toLowerCase() === common.toLowerCase());
  }, "No se permite el uso de contraseñas comunes")
  .refine((password) => {
    // Verificar que no tenga patrones repetitivos
    const hasRepetitivePattern = /(.)\1{3,}/.test(password) || // 4+ caracteres iguales seguidos
                               /^(.{1,3})\1+$/.test(password); // Patrones que se repiten
    return !hasRepetitivePattern;
  }, "La contraseña no puede tener patrones repetitivos");

// Función para verificar fortaleza de contraseña
export function calculatePasswordStrength(password: string): {
  score: number;
  feedback: string[];
  isAcceptable: boolean;
} {
  const feedback: string[] = [];
  let score = 0;

  // Longitud (0-25 puntos)
  if (password.length >= 12) score += 25;
  else if (password.length >= 8) score += 15;
  else feedback.push("Aumenta la longitud a al menos 12 caracteres");

  // Complejidad (0-40 puntos)
  if (/[a-z]/.test(password)) score += 10;
  else feedback.push("Incluye al menos una letra minúscula");
  
  if (/[A-Z]/.test(password)) score += 10;
  else feedback.push("Incluye al menos una letra mayúscula");
  
  if (/\d/.test(password)) score += 10;
  else feedback.push("Incluye al menos un número");
  
  if (/[@$!%*?&]/.test(password)) score += 10;
  else feedback.push("Incluye al menos un símbolo especial (@$!%*?&)");

  // Diversidad (0-20 puntos)
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= 10) score += 20;
  else if (uniqueChars >= 8) score += 15;
  else if (uniqueChars >= 6) score += 10;
  else feedback.push("Usa una mayor variedad de caracteres");

  // Patrones (0-15 puntos)
  if (!/(.)\1{2,}/.test(password)) score += 15; // No repetición de 3+ caracteres
  else feedback.push("Evita repetir caracteres consecutivamente");

  return {
    score,
    feedback,
    isAcceptable: score >= 70 // Requiere al menos 70% para ser aceptable
  };
}

// Función para validar contraseña de forma segura
export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
  strength: {
    score: number;
    feedback: string[];
    isAcceptable: boolean;
  };
} {
  const result = strongPasswordSchema.safeParse(password);
  const strength = calculatePasswordStrength(password);
  
  if (result.success) {
    return {
      isValid: strength.isAcceptable,
      errors: [],
      strength
    };
  } else {
    return {
      isValid: false,
      errors: result.error.issues.map(issue => issue.message),
      strength
    };
  }
}

// Función para comparar contraseñas de forma segura contra timing attacks
export function securePasswordCompare(inputPassword: string, storedHash: string): boolean {
  try {
    // Handle empty strings specially
    if (inputPassword === "" && storedHash === "") {
      return true;
    }
    
    const inputHash = createHash('sha256').update(inputPassword).digest('hex');
    // En Deno, usar Uint8Array en lugar de Buffer
    const inputBytes = new TextEncoder().encode(inputHash);
    const storedBytes = new TextEncoder().encode(storedHash);
    
    if (inputBytes.length !== storedBytes.length) {
      return false;
    }
    
    // Comparación segura contra timing attacks
    let result = 0;
    for (let i = 0; i < inputBytes.length; i++) {
      result |= inputBytes[i] ^ storedBytes[i];
    }
    return result === 0;
  } catch {
    return false;
  }
} 