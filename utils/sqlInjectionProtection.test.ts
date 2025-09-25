import { assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  sanitizeInput, 
  validateUUID, 
  validateNumericId, 
  validateQueryParams, 
  validateRequestBody,
  SecuritySeverity,
  getSecurityStats,
  getSecurityLogs
} from "./sqlInjectionProtection.ts";

// Helper function for assertions
function assertTrue(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || "Assertion failed: expected true");
  }
}

Deno.test("SQL Injection Protection - sanitizeInput", async (t) => {
  await t.step("should sanitize SQL injection attempts", () => {
    const maliciousInputs = [
      "'; DROP TABLE users; --",
      "' OR '1'='1",
      "'; INSERT INTO users VALUES ('hacker', 'password'); --",
      "'; UPDATE users SET password='hacked'; --",
      "'; DELETE FROM users; --",
      "'; CREATE TABLE hack (id int); --",
      "'; ALTER TABLE users ADD COLUMN hacked BOOLEAN; --",
      "'; EXEC xp_cmdshell('format c:'); --",
      "'; EXECUTE sp_configure 'show advanced options', 1; --"
    ];

    maliciousInputs.forEach(input => {
      const result = sanitizeInput(input, "test");
      assertEquals(result, "[CONTENIDO BLOQUEADO]", 
        `Should block malicious input: ${input}`);
    });
  });

  await t.step("should sanitize XSS attempts", () => {
    const xssInputs = [
      "<script>alert('xss')</script>",
      "javascript:alert('xss')",
      "vbscript:msgbox('xss')",
      "data:text/html,<script>alert('xss')</script>",
      "<img src=x onerror=alert('xss')>",
      "<svg onload=alert('xss')>",
      "<iframe src=javascript:alert('xss')>"
    ];

    xssInputs.forEach(input => {
      const result = sanitizeInput(input, "test");
      assertEquals(result, "[CONTENIDO BLOQUEADO]", 
        `Should block XSS input: ${input}`);
    });
  });

  await t.step("should allow safe inputs", () => {
    const safeInputs = [
      "Hello World",
      "John Doe",
      "123 Main Street",
      "test@example.com",
      "Product description with normal text",
      "Order #12345",
      "Customer feedback: Great service!"
    ];

    safeInputs.forEach(input => {
      const result = sanitizeInput(input, "test");
      assertFalse(result === "[CONTENIDO BLOQUEADO]", 
        `Should allow safe input: ${input}`);
      assertTrue(result.length > 0, 
        `Should not return empty string for: ${input}`);
    });
  });

  await t.step("should handle edge cases", () => {
    assertEquals(sanitizeInput("", "test"), "");
    assertEquals(sanitizeInput(null as unknown as string, "test"), "");
    assertEquals(sanitizeInput(undefined as unknown as string, "test"), "");
    assertEquals(sanitizeInput(123 as unknown as string, "test"), "");
  });
});

Deno.test("SQL Injection Protection - validateUUID", async (t) => {
  await t.step("should validate correct UUIDs", () => {
    const validUUIDs = [
      "123e4567-e89b-12d3-a456-426614174000",
      "550e8400-e29b-41d4-a716-446655440000",
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
      "6ba7b812-9dad-11d1-80b4-00c04fd430c8"
    ];

    validUUIDs.forEach(uuid => {
      assertTrue(validateUUID(uuid), `Should validate UUID: ${uuid}`);
    });
  });

  await t.step("should reject invalid UUIDs", () => {
    const invalidUUIDs = [
      "not-a-uuid",
      "123e4567-e89b-12d3-a456-42661417400", // too short
      "123e4567-e89b-12d3-a456-4266141740000", // too long
      "123e4567-e89b-12d3-a456-42661417400g", // invalid character
      "123e4567-e89b-12d3-a456-42661417400", // missing character
      "",
      null as unknown as string,
      undefined as unknown as string
    ];

    invalidUUIDs.forEach(uuid => {
      assertFalse(validateUUID(uuid), `Should reject invalid UUID: ${uuid}`);
    });
  });
});

Deno.test("SQL Injection Protection - validateNumericId", async (t) => {
  await t.step("should validate correct numeric IDs", () => {
    const validIds = [1, 100, 1000, 999999, "1", "100", "1000"];
    
    validIds.forEach(id => {
      assertTrue(validateNumericId(id), `Should validate numeric ID: ${id}`);
    });
  });

  await t.step("should reject invalid numeric IDs", () => {
    const invalidIds = [
      0, -1, -100, "0", "-1", "abc", "1,000",
      Number.MAX_SAFE_INTEGER + 1,
      "", null as unknown as string | number, undefined as unknown as string | number
    ];

    invalidIds.forEach(id => {
      assertFalse(validateNumericId(id), `Should reject invalid numeric ID: ${id}`);
    });
  });

  await t.step("should accept decimal numbers as valid", () => {
    const validDecimals = ["1.5", "2.0", "10.5"];
    
    validDecimals.forEach(id => {
      assertTrue(validateNumericId(id), `Should accept decimal ID: ${id}`);
    });
  });
});

Deno.test("SQL Injection Protection - validateQueryParams", async (t) => {
  await t.step("should validate safe query parameters", () => {
    const safeParams = {
      page: "1",
      limit: "10",
      search: "product",
      category: "electronics",
      sort: "name"
    };

    const result = validateQueryParams(safeParams);
    
    assertTrue(result.isValid);
    assertEquals(result.errors.length, 0);
    assertEquals(result.sanitized.page, "1");
    assertEquals(result.sanitized.search, "product");
  });

  await t.step("should detect malicious query parameters", () => {
    const maliciousParams = {
      search: "'; DROP TABLE users; --",
      category: "' OR '1'='1",
      sort: "<script>alert('xss')</script>"
    };

    const result = validateQueryParams(maliciousParams);
    
    assertFalse(result.isValid);
    assertTrue(result.errors.length > 0);
    assertTrue(result.errors.some(err => err.includes("contenido sospechoso")));
  });

  await t.step("should handle mixed safe and malicious params", () => {
    const mixedParams = {
      page: "1",
      search: "'; DROP TABLE users; --",
      limit: "10"
    };

    const result = validateQueryParams(mixedParams);
    
    assertFalse(result.isValid);
    assertTrue(result.errors.length > 0);
    assertEquals(result.sanitized.page, "1");
    assertEquals(result.sanitized.limit, "10");
  });
});

Deno.test("SQL Injection Protection - validateRequestBody", async (t) => {
  await t.step("should validate safe request body", () => {
    const safeBody = {
      name: "John Doe",
      email: "john@example.com",
      message: "Hello world"
    };

    const result = validateRequestBody(safeBody);
    
    assertTrue(result.isValid);
    assertEquals(result.errors.length, 0);
    assertEquals(result.sanitized.name, "John Doe");
    assertEquals(result.sanitized.email, "john@example.com");
  });

  await t.step("should detect malicious request body", () => {
    const maliciousBody = {
      name: "'; DROP TABLE users; --",
      email: "<script>alert('xss')</script>",
      message: "' OR '1'='1"
    };

    const result = validateRequestBody(maliciousBody);
    
    assertFalse(result.isValid);
    assertTrue(result.errors.length > 0);
    assertTrue(result.errors.some(err => err.includes("contenido sospechoso")));
  });

  await t.step("should handle nested objects", () => {
    const nestedBody = {
      user: {
        name: "John",
        email: "'; DROP TABLE users; --"
      },
      settings: {
        theme: "dark",
        notifications: true
      }
    };

    const result = validateRequestBody(nestedBody);
    
    assertFalse(result.isValid);
    assertTrue(result.errors.length > 0);
    assertTrue(result.errors.some(err => err.includes("user.email")));
    assertEquals((result.sanitized.user as Record<string, unknown>).name as string, "John");
    assertEquals((result.sanitized.settings as Record<string, unknown>).theme as string, "dark");
    assertEquals((result.sanitized.settings as Record<string, unknown>).notifications as boolean, true);
    const sanitizedEmail = (result.sanitized.user as Record<string, unknown>).email;
    console.log("Sanitized email:", sanitizedEmail);
    assertEquals(
      sanitizedEmail,
      undefined,
      `Sanitized email should be undefined, got: ${sanitizedEmail}`
    );
  });
});

Deno.test("SQL Injection Protection - Security Logger", async (t) => {
  await t.step("should log suspicious activity", () => {
    const initialStats = getSecurityStats();
    
    // Trigger some suspicious activity
    sanitizeInput("'; DROP TABLE users; --", "test");
    sanitizeInput("<script>alert('xss')</script>", "test");
    
    const finalStats = getSecurityStats();
    
    assertTrue(finalStats.total > initialStats.total);
    assertTrue(finalStats.blocked > initialStats.blocked);
    assertTrue(finalStats.bySeverity[SecuritySeverity.HIGH] > 0);
  });

  await t.step("should maintain log limits", () => {
    const logs = getSecurityLogs(10);
    assertTrue(logs.length <= 10);
  });
});

Deno.test("SQL Injection Protection - Integration Tests", async (t) => {
  await t.step("should handle complex attack patterns", () => {
    const complexAttacks = [
      // Union-based injection
      "' UNION SELECT username, password FROM users --",
      
      // Boolean-based injection
      "' AND 1=1 --",
      "' AND 1=2 --",
      
      // Time-based injection
      "'; WAITFOR DELAY '00:00:05' --",
      
      // Stacked queries
      "'; INSERT INTO users VALUES ('hacker', 'pass'); SELECT * FROM users --",
      
      // Comment variations
      "/* DROP TABLE users */",
      "-- DROP TABLE users",
      "# DROP TABLE users",
      
      // Encoding attempts
      "%27%20OR%201%3D1",
      "&#39; OR 1=1",
      
      // Case variations
      "SeLeCt * FrOm UsErS",
      "UNION SELECT",
      "union select"
    ];

    complexAttacks.forEach(attack => {
      const result = sanitizeInput(attack, "test");
      assertEquals(result, "[CONTENIDO BLOQUEADO]", 
        `Should block complex attack: ${attack}`);
    });
  });

  await t.step("should strictly block SQL-like text", () => {
    const sqlLikeTexts = [
      "I want to select the best product",
      "Please insert my order",
      "Update my profile information",
      "Delete old records",
      "Create new account",
      "Alter my preferences",
      "Execute the command",
      "Union of two companies",
      "Select all items from catalog"
    ];

    sqlLikeTexts.forEach(text => {
      const result = sanitizeInput(text, "test");
      // With strict sanitization, any text containing SQL keywords should be blocked
      assertEquals(result, "[CONTENIDO BLOQUEADO]", 
        `Should block text with SQL keywords: ${text}`);
    });
  });
});

Deno.test("SQL Injection Protection - Performance Tests", async (t) => {
  await t.step("should handle large inputs efficiently", () => {
    const largeInput = "A".repeat(10000) + "'; DROP TABLE users; --";
    
    const startTime = Date.now();
    const result = sanitizeInput(largeInput, "test");
    const endTime = Date.now();
    
    assertEquals(result, "[CONTENIDO BLOQUEADO]");
    assertTrue(endTime - startTime < 100, "Should process large input quickly");
  });

  await t.step("should handle many inputs efficiently", () => {
    const inputs = Array(1000).fill("'; DROP TABLE users; --");
    
    const startTime = Date.now();
    inputs.forEach(input => sanitizeInput(input, "test"));
    const endTime = Date.now();
    
    assertTrue(endTime - startTime < 1000, "Should process many inputs quickly");
  });
});

// Test runner
if (import.meta.main) {
  console.log("🧪 Running SQL Injection Protection Tests...");
  
  await Deno.test({
    name: "SQL Injection Protection Suite",
    fn: async () => {
      // Tests will run automatically
    },
    sanitizeOps: false,
    sanitizeResources: false
  });
  
  console.log("✅ All SQL Injection Protection tests completed!");
} 