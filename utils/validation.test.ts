import { assertEquals } from "https://deno.land/std@0.220.1/assert/mod.ts";
import { 
  trialActivationSchema, 
  employeeInvitationSchema, 
  businessSettingsUpdateSchema,
  validateData,
  sanitizeString,
  validateAndSanitizeEmail,
  validateUrl,
  validateMexicanPhone,
  validateMexicanRFC
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

Deno.test("validateMexicanPhone - Valid Phones", () => {
  const validPhones = [
    "5512345678",
    "+525512345678",
    "525512345678"
  ];

  validPhones.forEach(phone => {
    assertEquals(validateMexicanPhone(phone), true, `Phone should be valid: ${phone}`);
  });
});

Deno.test("validateMexicanPhone - Invalid Phones", () => {
  const invalidPhones = [
    "123456789", // Too short
    "55123456789", // Too long
    "0123456789", // Starts with 0
    "invalid"
  ];

  invalidPhones.forEach(phone => {
    assertEquals(validateMexicanPhone(phone), false, `Phone should be invalid: ${phone}`);
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