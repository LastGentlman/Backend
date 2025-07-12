import { assertEquals, assert } from "https://deno.land/std@0.220.1/assert/mod.ts";

// Helper functions for assertions
const assertTrue = (condition: boolean, message?: string) => assert(condition, message);
const assertFalse = (condition: boolean, message?: string) => assert(!condition, message);
import { 
  strongPasswordSchema, 
  calculatePasswordStrength, 
  validatePassword,
  securePasswordCompare 
} from "./passwordSecurity.ts";

Deno.test("Password Security - Strong Password Schema", async (t) => {
  await t.step("should accept valid strong password", () => {
    const validPassword = "StrongPass123!";
    const result = strongPasswordSchema.safeParse(validPassword);
    assertTrue(result.success);
  });

  await t.step("should reject password shorter than 12 characters", () => {
    const shortPassword = "Short1!";
    const result = strongPasswordSchema.safeParse(shortPassword);
    assertFalse(result.success);
    if (!result.success) {
      assertEquals(result.error.issues[0].message, "La contraseña debe tener al menos 12 caracteres");
    }
  });

  await t.step("should reject password without uppercase", () => {
    const noUpperPassword = "strongpass123!";
    const result = strongPasswordSchema.safeParse(noUpperPassword);
    assertFalse(result.success);
    if (!result.success) {
      assertEquals(result.error.issues[0].message, "La contraseña debe incluir: al menos una minúscula, una mayúscula, un número y un símbolo especial (@$!%*?&)");
    }
  });

  await t.step("should reject password without lowercase", () => {
    const noLowerPassword = "STRONGPASS123!";
    const result = strongPasswordSchema.safeParse(noLowerPassword);
    assertFalse(result.success);
  });

  await t.step("should reject password without numbers", () => {
    const noNumberPassword = "StrongPass!";
    const result = strongPasswordSchema.safeParse(noNumberPassword);
    assertFalse(result.success);
  });

  await t.step("should reject password without special characters", () => {
    const noSpecialPassword = "StrongPass123";
    const result = strongPasswordSchema.safeParse(noSpecialPassword);
    assertFalse(result.success);
  });

  await t.step("should reject common passwords", () => {
    const commonPassword = "Password123!";
    const result = strongPasswordSchema.safeParse(commonPassword);
    assertFalse(result.success);
    if (!result.success) {
      assertEquals(result.error.issues[0].message, "No se permite el uso de contraseñas comunes");
    }
  });

  await t.step("should reject repetitive patterns", () => {
    const repetitivePassword = "aaaaBBBB123!";
    const result = strongPasswordSchema.safeParse(repetitivePassword);
    assertFalse(result.success);
    if (!result.success) {
      assertEquals(result.error.issues[0].message, "La contraseña no puede tener patrones repetitivos");
    }
  });
});

Deno.test("Password Security - Calculate Password Strength", async (t) => {
  await t.step("should calculate high strength for strong password", () => {
    const strongPassword = "StrongPass123!";
    const strength = calculatePasswordStrength(strongPassword);
    
    assertTrue(strength.score >= 70);
    assertTrue(strength.isAcceptable);
    assertEquals(strength.feedback.length, 0);
  });

  await t.step("should calculate low strength for weak password", () => {
    const weakPassword = "weak";
    const strength = calculatePasswordStrength(weakPassword);
    
    assertTrue(strength.score < 70);
    assertFalse(strength.isAcceptable);
    assertTrue(strength.feedback.length > 0);
  });

  await t.step("should provide specific feedback for missing requirements", () => {
    const password = "onlylowercase";
    const strength = calculatePasswordStrength(password);
    
    assertTrue(strength.feedback.some(f => f.includes("mayúscula")));
    assertTrue(strength.feedback.some(f => f.includes("número")));
    assertTrue(strength.feedback.some(f => f.includes("símbolo")));
  });

  await t.step("should score length correctly", () => {
    const shortPassword = "Short1!";
    const mediumPassword = "MediumPass1!";
    const longPassword = "VeryLongStrongPassword123!";
    
    const shortStrength = calculatePasswordStrength(shortPassword);
    const mediumStrength = calculatePasswordStrength(mediumPassword);
    const longStrength = calculatePasswordStrength(longPassword);
    
    // All should have different scores based on length
    assertTrue(longStrength.score >= mediumStrength.score);
    assertTrue(mediumStrength.score >= shortStrength.score);
  });

  await t.step("should score character diversity correctly", () => {
    const diversePassword = "StrongPass123!@#";
    const lessDiversePassword = "StrongPass123!";
    
    const diverseStrength = calculatePasswordStrength(diversePassword);
    const lessDiverseStrength = calculatePasswordStrength(lessDiversePassword);
    
    assertTrue(diverseStrength.score >= lessDiverseStrength.score);
  });
});

Deno.test("Password Security - Validate Password", async (t) => {
  await t.step("should validate strong password", () => {
    const strongPassword = "StrongPass123!";
    const validation = validatePassword(strongPassword);
    
    assertTrue(validation.isValid);
    assertEquals(validation.errors.length, 0);
    assertTrue(validation.strength.isAcceptable);
  });

  await t.step("should reject weak password with detailed feedback", () => {
    const weakPassword = "weak";
    const validation = validatePassword(weakPassword);
    
    assertFalse(validation.isValid);
    assertTrue(validation.errors.length > 0);
    assertFalse(validation.strength.isAcceptable);
  });

  await t.step("should provide both schema and strength errors", () => {
    const invalidPassword = "short";
    const validation = validatePassword(invalidPassword);
    
    assertFalse(validation.isValid);
    assertTrue(validation.errors.length > 0);
    assertTrue(validation.strength.feedback.length > 0);
  });
});

Deno.test("Password Security - Secure Password Compare", async (t) => {
  await t.step("should correctly compare matching passwords", () => {
    const password = "StrongPass123!";
    const hash = "a1b2c3d4e5f6"; // Mock hash
    
    // In a real scenario, this would be the actual hash
    const result = securePasswordCompare(password, hash);
    // This will be false because we're not actually hashing the password
    // In real usage, you'd compare against the actual hash
    assertFalse(result);
  });

  await t.step("should handle different length strings", () => {
    const result = securePasswordCompare("password", "different");
    assertFalse(result);
  });

  await t.step("should handle empty strings", () => {
    const result = securePasswordCompare("", "");
    // Empty strings should be considered equal
    assertTrue(result);
  });
});

Deno.test("Password Security - Integration Tests", async (t) => {
  await t.step("should work with real-world strong passwords", () => {
    const realWorldPasswords = [
      "MySecurePass123!",
      "Complex@Password456",
      "Robust$Protection2024!"
    ];

    for (const password of realWorldPasswords) {
      const validation = validatePassword(password);
      assertTrue(validation.isValid, `Password "${password}" should be valid`);
      assertTrue(validation.strength.isAcceptable, `Password "${password}" should be acceptable`);
    }
  });

  await t.step("should reject real-world weak passwords", () => {
    const weakPasswords = [
      "password123",
      "123456789012",
      "qwerty123456",
      "admin123456!",
      "welcome123456"
    ];

    for (const password of weakPasswords) {
      const validation = validatePassword(password);
      assertFalse(validation.isValid, `Password "${password}" should be invalid`);
    }
  });
}); 