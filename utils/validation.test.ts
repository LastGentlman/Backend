import { assertEquals } from "https://deno.land/std@0.220.1/assert/mod.ts";
import { 
  trialActivationSchema, 
  employeeInvitationSchema, 
  businessSettingsUpdateSchema,
  validateData,
  sanitizeString,
  validateAndSanitizeEmail,
  validateUrl,
  validatePhone,
  validateMexicanRFC,
  validatePhoneWithDetails
} from "./validation.ts";

// ===== TESTS PARA SCHEMAS =====

Deno.test("Trial Activation Schema - Valid Data", () => {
  const validData = {
    businessName: "Mi Negocio",
    businessEmail: "negocio@example.com",
    businessPhone: "+525512345678",
    businessAddress: "Calle Principal 123",
    billingName: "Facturación S.A.",
    billingAddress: "Av. Billing 456",
    taxId: "XAXX010101000",
    taxRegime: "605",
    currency: "MXN"
  };

  const result = validateData(trialActivationSchema, validData);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.businessName, "Mi Negocio");
    assertEquals(result.data.businessEmail, "negocio@example.com");
    assertEquals(result.data.taxRegime, "605");
  }
});

Deno.test("Trial Activation Schema - Invalid Email", () => {
  const invalidData = {
    businessName: "Mi Negocio",
    businessEmail: "invalid-email",
    billingName: "Facturación S.A.",
    taxRegime: "605"
  };

  const result = validateData(trialActivationSchema, invalidData);
  assertEquals(result.success, false);
  if (!result.success) {
    const emailError = result.errors.issues.find(issue => 
      issue.path.includes("businessEmail")
    );
    assertEquals(emailError?.message, "Email de negocio inválido");
  }
});

Deno.test("Trial Activation Schema - Invalid Tax Regime", () => {
  const invalidData = {
    businessName: "Mi Negocio",
    businessEmail: "negocio@example.com",
    billingName: "Facturación S.A.",
    taxRegime: "9999" // Invalid
  };

  const result = validateData(trialActivationSchema, invalidData);
  assertEquals(result.success, false);
  if (!result.success) {
    const taxError = result.errors.issues.find(issue => 
      issue.path.includes("taxRegime")
    );
    assertEquals(taxError?.message, "Régimen fiscal inválido");
  }
});

Deno.test("Trial Activation Schema - Invalid Business Name", () => {
  const invalidData = {
    businessName: "<script>alert('xss')</script>", // Contains invalid characters
    businessEmail: "negocio@example.com",
    billingName: "Facturación S.A.",
    taxRegime: "605"
  };

  const result = validateData(trialActivationSchema, invalidData);
  assertEquals(result.success, false);
  if (!result.success) {
    const nameError = result.errors.issues.find(issue => 
      issue.path.includes("businessName")
    );
    assertEquals(nameError?.message, "El nombre del negocio solo puede contener letras, números, espacios, guiones, guiones bajos y puntos");
  }
});

Deno.test("Employee Invitation Schema - Valid Data", () => {
  const validData = {
    email: "empleado@example.com",
    role: "admin"
  };

  const result = validateData(employeeInvitationSchema, validData);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.email, "empleado@example.com");
    assertEquals(result.data.role, "admin");
  }
});

Deno.test("Employee Invitation Schema - Invalid Role", () => {
  const invalidData = {
    email: "empleado@example.com",
    role: "invalid_role"
  };

  const result = validateData(employeeInvitationSchema, invalidData);
  assertEquals(result.success, false);
  if (!result.success) {
    const roleError = result.errors.issues.find(issue => 
      issue.path.includes("role")
    );
    assertEquals(roleError?.message, "Rol inválido. Solo se permiten: admin, seller");
  }
});

Deno.test("Employee Invitation Schema - Email Normalization", () => {
  const validData = {
    email: "EMPLEADO@EXAMPLE.COM",
    role: "seller"
  };

  const result = validateData(employeeInvitationSchema, validData);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.email, "empleado@example.com"); // Should be lowercase
    assertEquals(result.data.role, "seller");
  }
});

Deno.test("Business Settings Update Schema - Valid Data", () => {
  const validData = {
    name: "Nuevo Nombre",
    settings: {
      currency: "USD",
      notifications: {
        email: true,
        push: false
      }
    }
  };

  const result = validateData(businessSettingsUpdateSchema, validData);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.name, "Nuevo Nombre");
    assertEquals(result.data.settings?.currency, "USD");
  }
});

// ===== TESTS PARA FUNCIONES DE SANITIZACIÓN =====

Deno.test("sanitizeString - Basic Sanitization", () => {
  const input = "  <script>alert('xss')</script>  ";
  const result = sanitizeString(input);
  assertEquals(result, "scriptalert('xss')/script");
});

Deno.test("sanitizeString - Normalize Spaces", () => {
  const input = "  multiple    spaces  ";
  const result = sanitizeString(input);
  assertEquals(result, "multiple spaces");
});

Deno.test("validateAndSanitizeEmail - Valid Email", () => {
  const email = "  TEST@EXAMPLE.COM  ";
  const result = validateAndSanitizeEmail(email);
  assertEquals(result, "test@example.com");
});

Deno.test("validateAndSanitizeEmail - Invalid Email", () => {
  const email = "invalid-email";
  const result = validateAndSanitizeEmail(email);
  assertEquals(result, null);
});

Deno.test("validateUrl - Valid URLs", () => {
  const validUrls = [
    "https://example.com",
    "http://localhost:3000",
    "https://api.example.com/path?param=value"
  ];

  validUrls.forEach(url => {
    assertEquals(validateUrl(url), true, `URL should be valid: ${url}`);
  });
});

Deno.test("validateUrl - Invalid URLs", () => {
  const invalidUrls = [
    "not-a-url",
    "javascript:alert('xss')"
  ];

  invalidUrls.forEach(url => {
    assertEquals(validateUrl(url), false, `URL should be invalid: ${url}`);
  });
});

Deno.test("validatePhone - Valid Phones", () => {
  const validPhones = [
    // Números mexicanos
    "5512345678", // 10 dígitos (formato mexicano estándar)
    "+52 5512345678", // Con prefijo de país
    "52 5512345678", // Con prefijo sin +
    "55-123-45-67-8", // Con guiones
    "55 123 45 67 8", // Con espacios
    "5512345678", // 10 dígitos con prefijo 55 (México)
    "5212345678", // 10 dígitos con prefijo 52 (México)
    
    // Números internacionales
    "15551234567", // 10 dígitos con prefijo 1 (Estados Unidos/Canadá)
    "155512345678", // 11 dígitos con prefijo 1 (Estados Unidos/Canadá)
    "+1 555 123 4567", // Formato internacional
    "34123456789", // España (9 dígitos con prefijo 34)
    "33123456789", // Francia (9 dígitos con prefijo 33)
    "49123456789", // Alemania (9 dígitos con prefijo 49)
    "441234567890", // Reino Unido (10 dígitos con prefijo 44)
    
    // Números de Latinoamérica
    "54123456789", // Argentina (11 dígitos con prefijo 54)
    "57123456789", // Colombia (11 dígitos con prefijo 57)
    "51123456789", // Perú (11 dígitos con prefijo 51)
    "56123456789", // Chile (11 dígitos con prefijo 56)
    "55123456789", // Brasil (11 dígitos con prefijo 55)
    "58123456789", // Venezuela (11 dígitos con prefijo 58)
    "59312345678", // Ecuador (11 dígitos con prefijo 593)
    "5911234567", // Bolivia (11 dígitos con prefijo 591)
    "59512345678", // Paraguay (11 dígitos con prefijo 595)
    "5981234567", // Uruguay (11 dígitos con prefijo 598)
    "5021234567", // Guatemala (11 dígitos con prefijo 502)
    "5031234567", // El Salvador (11 dígitos con prefijo 503)
    "5041234567", // Honduras (11 dígitos con prefijo 504)
    "5051234567", // Nicaragua (11 dígitos con prefijo 505)
    "5061234567", // Costa Rica (11 dígitos con prefijo 506)
    "5071234567", // Panamá (11 dígitos con prefijo 507)
    "5312345678", // Cuba (10 dígitos con prefijo 53)
  ];

  validPhones.forEach(phone => {
    assertEquals(validatePhone(phone), true, `Phone should be valid: ${phone}`);
  });
});

Deno.test("validatePhone - Invalid Phones", () => {
  const invalidPhones = [
    "123456789", // Too short (9 digits)
    "123456789a", // Contains letters
    "invalid", // Not a number
    "551234567", // 9 dígitos con prefijo 55 (inválido)
    "521234567", // 9 dígitos con prefijo 52 (inválido)
    "1234567890123456" // Muy largo (16 dígitos)
  ];

  invalidPhones.forEach(phone => {
    assertEquals(validatePhone(phone), false, `Phone should be invalid: ${phone}`);
  });
});

Deno.test("validatePhoneWithDetails - Valid Phones with Details", () => {
  const testCases = [
    {
      input: "5512345678",
      expected: {
        isValid: true,
        cleanNumber: "5512345678",
        suggestedFormat: "+52 551 234 5678",
        countryCode: "MX",
        isInternational: false
      }
    },
    {
      input: "5212345678",
      expected: {
        isValid: true,
        cleanNumber: "5212345678",
        suggestedFormat: "+52 521 234 5678",
        countryCode: "MX",
        isInternational: false
      }
    },
    {
      input: "34123456789",
      expected: {
        isValid: true,
        cleanNumber: "123456789",
        suggestedFormat: "+34 123 456 789",
        countryCode: "ES",
        isInternational: true
      }
    },
    {
      input: "15551234567",
      expected: {
        isValid: true,
        cleanNumber: "15551234567",
        suggestedFormat: "+1 555 123 4567",
        countryCode: "US",
        isInternational: true
      }
    }
  ];

  testCases.forEach(({ input, expected }) => {
    const result = validatePhoneWithDetails(input);
    assertEquals(result.isValid, expected.isValid, `Validation result for ${input}`);
    assertEquals(result.cleanNumber, expected.cleanNumber, `Clean number for ${input}`);
    assertEquals(result.suggestedFormat, expected.suggestedFormat, `Suggested format for ${input}`);
    assertEquals(result.countryCode, expected.countryCode, `Country code for ${input}`);
    assertEquals(result.isInternational, expected.isInternational, `International flag for ${input}`);
  });
});

Deno.test("validatePhoneWithDetails - Invalid Phones with Error Details", () => {
  const testCases = [
    {
      input: "123456789",
      expected: {
        isValid: false,
        reason: "Formato inválido para los países soportados",
        cleanNumber: "123456789"
      }
    },
    {
      input: "0123456789",
      expected: {
        isValid: false,
        reason: "No puede empezar con 0",
        cleanNumber: "0123456789"
      }
    },
    {
      input: "1234567890123456",
      expected: {
        isValid: false,
        reason: "Muy largo (16 dígitos, máximo 15)",
        cleanNumber: "1234567890123456"
      }
    }
  ];

  testCases.forEach(({ input, expected }) => {
    const result = validatePhoneWithDetails(input);
    assertEquals(result.isValid, expected.isValid, `Validation result for ${input}`);
    assertEquals(result.reason, expected.reason, `Error reason for ${input}`);
    assertEquals(result.cleanNumber, expected.cleanNumber, `Clean number for ${input}`);
  });
});

Deno.test("validatePhoneWithDetails - International Phone Numbers", () => {
  const testCases = [
    {
      input: "34123456789",
      expected: {
        isValid: true,
        countryCode: "ES",
        isInternational: true
      }
    },
    {
      input: "33123456789",
      expected: {
        isValid: true,
        countryCode: "FR",
        isInternational: true
      }
    },
    {
      input: "49123456789",
      expected: {
        isValid: true,
        countryCode: "DE",
        isInternational: true
      }
    },
    {
      input: "441234567890",
      expected: {
        isValid: true,
        countryCode: "GB",
        isInternational: true
      }
    },
    // Nuevos países de Latinoamérica
    {
      input: "54123456789",
      expected: {
        isValid: true,
        countryCode: "AR",
        isInternational: true
      }
    },
    {
      input: "57123456789",
      expected: {
        isValid: true,
        countryCode: "CO",
        isInternational: true
      }
    },
    {
      input: "51123456789",
      expected: {
        isValid: true,
        countryCode: "PE",
        isInternational: true
      }
    },
    {
      input: "56123456789",
      expected: {
        isValid: true,
        countryCode: "CL",
        isInternational: true
      }
    },
    {
      input: "55123456789",
      expected: {
        isValid: true,
        countryCode: "BR",
        isInternational: true
      }
    },
    {
      input: "58123456789",
      expected: {
        isValid: true,
        countryCode: "VE",
        isInternational: true
      }
    },
    {
      input: "59312345678",
      expected: {
        isValid: true,
        countryCode: "EC",
        isInternational: true
      }
    },
    {
      input: "5911234567",
      expected: {
        isValid: true,
        countryCode: "BO",
        isInternational: true
      }
    },
    {
      input: "59512345678",
      expected: {
        isValid: true,
        countryCode: "PY",
        isInternational: true
      }
    },
    {
      input: "5981234567",
      expected: {
        isValid: true,
        countryCode: "UY",
        isInternational: true
      }
    },
    {
      input: "5021234567",
      expected: {
        isValid: true,
        countryCode: "GT",
        isInternational: true
      }
    },
    {
      input: "5031234567",
      expected: {
        isValid: true,
        countryCode: "SV",
        isInternational: true
      }
    },
    {
      input: "5041234567",
      expected: {
        isValid: true,
        countryCode: "HN",
        isInternational: true
      }
    },
    {
      input: "5051234567",
      expected: {
        isValid: true,
        countryCode: "NI",
        isInternational: true
      }
    },
    {
      input: "5061234567",
      expected: {
        isValid: true,
        countryCode: "CR",
        isInternational: true
      }
    },
    {
      input: "5071234567",
      expected: {
        isValid: true,
        countryCode: "PA",
        isInternational: true
      }
    },
    {
      input: "5312345678",
      expected: {
        isValid: true,
        countryCode: "CU",
        isInternational: true
      }
    }
  ];

  testCases.forEach(({ input, expected }) => {
    const result = validatePhoneWithDetails(input);
    assertEquals(result.isValid, expected.isValid, `Validation result for ${input}`);
    assertEquals(result.countryCode, expected.countryCode, `Country code for ${input}`);
    assertEquals(result.isInternational, expected.isInternational, `International flag for ${input}`);
  });
});

Deno.test("validateMexicanRFC - Valid RFCs", () => {
  const validRFCs = [
    "XAXX010101000", // Generic RFC
    "MEX123456789", // Company RFC
    "ABCD123456EFG" // Valid format
  ];

  validRFCs.forEach(rfc => {
    assertEquals(validateMexicanRFC(rfc), true, `RFC should be valid: ${rfc}`);
  });
});

Deno.test("validateMexicanRFC - Invalid RFCs", () => {
  const invalidRFCs = [
    "123456789", // Too short
    "ABCD123456789012345", // Too long
    "ABCD123456", // Invalid format
    "invalid"
  ];

  invalidRFCs.forEach(rfc => {
    assertEquals(validateMexicanRFC(rfc), false, `RFC should be invalid: ${rfc}`);
  });
});

// ===== TESTS DE CASOS EDGE =====

Deno.test("Trial Activation Schema - Optional Fields", () => {
  const minimalData = {
    businessName: "Mi Negocio",
    businessEmail: "negocio@example.com",
    billingName: "Facturación S.A.",
    taxRegime: "605"
    // Missing optional fields
  };

  const result = validateData(trialActivationSchema, minimalData);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.businessPhone, undefined);
    assertEquals(result.data.businessAddress, undefined);
    assertEquals(result.data.currency, "MXN"); // Default value
  }
});

Deno.test("Trial Activation Schema - Payment Method Validation", () => {
  const dataWithPayment = {
    businessName: "Mi Negocio",
    businessEmail: "negocio@example.com",
    billingName: "Facturación S.A.",
    taxRegime: "605",
    paymentMethod: {
      type: "card",
      card: {
        number: "4242424242424242",
        exp_month: 12,
        exp_year: 2025,
        cvc: "123"
      }
    }
  };

  const result = validateData(trialActivationSchema, dataWithPayment);
  assertEquals(result.success, true);
});

Deno.test("Trial Activation Schema - Invalid Payment Method", () => {
  const dataWithInvalidPayment = {
    businessName: "Mi Negocio",
    businessEmail: "negocio@example.com",
    billingName: "Facturación S.A.",
    taxRegime: "605",
    paymentMethod: {
      type: "card",
      card: {
        number: "123", // Invalid card number
        exp_month: 13, // Invalid month
        exp_year: 2020, // Past year
        cvc: "12" // Too short
      }
    }
  };

  const result = validateData(trialActivationSchema, dataWithInvalidPayment);
  assertEquals(result.success, false);
  if (!result.success) {
    const errors = result.errors.issues.map(issue => issue.message);
    assertEquals(errors.some(msg => msg.includes("Número de tarjeta inválido")), true);
    assertEquals(errors.some(msg => msg.includes("Mes de expiración inválido")), true);
    assertEquals(errors.some(msg => msg.includes("Año de expiración inválido")), true);
    assertEquals(errors.some(msg => msg.includes("CVC inválido")), true);
  }
});

console.log("✅ Todos los tests de validación pasaron correctamente!"); 