import { assertEquals, assertExists } from "https://deno.land/std@0.220.1/assert/mod.ts";
import { ConflictResolver } from "./conflictResolution.ts";

Deno.test("ConflictResolver - Local wins when local timestamp is newer", async () => {
  const localOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    total: 150.00,
    last_modified_at: "2024-01-15T10:30:00Z",
    created_at: "2024-01-15T09:00:00Z"
  };

  const serverOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    total: 120.00,
    last_modified_at: "2024-01-15T09:30:00Z",
    created_at: "2024-01-15T09:00:00Z"
  };

  const resolution = await ConflictResolver.resolveOrderConflict(localOrder, serverOrder);

  assertEquals(resolution.action, "local_wins");
  assertEquals(resolution.resolvedData, localOrder);
  assertExists(resolution.message);
  assertExists(resolution.timestamp);
});

Deno.test("ConflictResolver - Server wins when server timestamp is newer", async () => {
  const localOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    total: 150.00,
    last_modified_at: "2024-01-15T09:30:00Z",
    created_at: "2024-01-15T09:00:00Z"
  };

  const serverOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    total: 120.00,
    last_modified_at: "2024-01-15T10:30:00Z",
    created_at: "2024-01-15T09:00:00Z"
  };

  const resolution = await ConflictResolver.resolveOrderConflict(localOrder, serverOrder);

  assertEquals(resolution.action, "server_wins");
  assertEquals(resolution.resolvedData, serverOrder);
  assertExists(resolution.message);
  assertExists(resolution.timestamp);
});

Deno.test("ConflictResolver - Server wins when timestamps are equal", async () => {
  const localOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    total: 150.00,
    last_modified_at: "2024-01-15T10:30:00Z",
    created_at: "2024-01-15T09:00:00Z"
  };

  const serverOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    total: 120.00,
    last_modified_at: "2024-01-15T10:30:00Z",
    created_at: "2024-01-15T09:00:00Z"
  };

  const resolution = await ConflictResolver.resolveOrderConflict(localOrder, serverOrder);

  assertEquals(resolution.action, "server_wins");
  assertEquals(resolution.resolvedData, serverOrder);
  assertExists(resolution.message);
  assertExists(resolution.timestamp);
});

Deno.test("ConflictResolver - Detect field conflicts correctly", () => {
  const localOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    client_phone: "123456789",
    total: 150.00,
    delivery_date: "2024-01-16",
    delivery_time: "14:00",
    status: "pending",
    notes: "Notas locales",
    last_modified_at: "2024-01-15T10:30:00Z"
  };

  const serverOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    client_phone: "987654321",
    total: 120.00,
    delivery_date: "2024-01-16",
    delivery_time: "15:00",
    status: "preparing",
    notes: "Notas del servidor",
    last_modified_at: "2024-01-15T09:30:00Z"
  };

  const conflicts = ConflictResolver.detectFieldConflicts(localOrder, serverOrder);

  assertEquals(conflicts.length, 4); // client_phone, total, delivery_time, status, notes
  assertEquals(conflicts[0].field, "client_phone");
  assertEquals(conflicts[0].localValue, "123456789");
  assertEquals(conflicts[0].serverValue, "987654321");
});

Deno.test("ConflictResolver - No conflicts when orders are identical", () => {
  const localOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    client_phone: "123456789",
    total: 150.00,
    delivery_date: "2024-01-16",
    delivery_time: "14:00",
    status: "pending",
    notes: "Notas",
    last_modified_at: "2024-01-15T10:30:00Z"
  };

  const serverOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    client_phone: "123456789",
    total: 150.00,
    delivery_date: "2024-01-16",
    delivery_time: "14:00",
    status: "pending",
    notes: "Notas",
    last_modified_at: "2024-01-15T10:30:00Z"
  };

  const conflicts = ConflictResolver.detectFieldConflicts(localOrder, serverOrder);

  assertEquals(conflicts.length, 0);
});

Deno.test("ConflictResolver - Handle missing timestamps gracefully", async () => {
  const localOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    total: 150.00,
    created_at: "2024-01-15T10:30:00Z"
  };

  const serverOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    total: 120.00,
    created_at: "2024-01-15T09:30:00Z"
  };

  const resolution = await ConflictResolver.resolveOrderConflict(localOrder, serverOrder);

  assertEquals(resolution.action, "local_wins");
  assertEquals(resolution.resolvedData, localOrder);
});

Deno.test("ConflictResolver - Handle null/undefined values in field detection", () => {
  const localOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    client_phone: null,
    total: 150.00,
    delivery_date: "2024-01-16",
    delivery_time: undefined,
    status: "pending",
    notes: "",
    last_modified_at: "2024-01-15T10:30:00Z"
  };

  const serverOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    client_phone: "123456789",
    total: 150.00,
    delivery_date: "2024-01-16",
    delivery_time: "14:00",
    status: "pending",
    notes: null,
    last_modified_at: "2024-01-15T10:30:00Z"
  };

  const conflicts = ConflictResolver.detectFieldConflicts(localOrder, serverOrder);

  // Debería detectar conflictos en client_phone, delivery_time y notes
  assertEquals(conflicts.length, 3);
  
  const conflictFields = conflicts.map(c => c.field);
  assertEquals(conflictFields.includes("client_phone"), true);
  assertEquals(conflictFields.includes("delivery_time"), true);
  assertEquals(conflictFields.includes("notes"), true);
});

Deno.test("ConflictResolver - Handle edge cases with invalid dates", async () => {
  const localOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    total: 150.00,
    last_modified_at: "invalid-date"
  };

  const serverOrder = {
    id: "order-1",
    client_name: "Juan Pérez",
    total: 120.00,
    last_modified_at: "2024-01-15T09:30:00Z"
  };

  // Debería manejar fechas inválidas sin fallar
  const resolution = await ConflictResolver.resolveOrderConflict(localOrder, serverOrder);
  
  assertExists(resolution);
  assertExists(resolution.action);
  assertExists(resolution.message);
});

// Test de integración para sincronización masiva
Deno.test("syncAllPendingOrders - Handle multiple orders", async () => {
  const offlineOrders = [
    {
      client_generated_id: "uuid-1",
      client_name: "Juan Pérez",
      total: 150.00,
      last_modified_at: "2024-01-15T10:30:00Z"
    },
    {
      client_generated_id: "uuid-2", 
      client_name: "María García",
      total: 200.00,
      last_modified_at: "2024-01-15T11:30:00Z"
    }
  ];

  const userId = "user-123";

  // Mock de la función para testing
  const mockSyncOrderWithConflictResolution = async (order: any, userId: string) => {
    return true; // Simular éxito
  };

  // Reemplazar temporalmente el método para testing
  const originalMethod = ConflictResolver.syncOrderWithConflictResolution;
  ConflictResolver.syncOrderWithConflictResolution = mockSyncOrderWithConflictResolution;

  try {
    // Importar la función de sincronización masiva
    const { syncAllPendingOrders } = await import("./conflictResolution.ts");
    const result = await syncAllPendingOrders(offlineOrders, userId);

    assertEquals(result.synced.length, 2);
    assertEquals(result.errors.length, 0);
    assertEquals(result.conflicts.length, 0);
  } finally {
    // Restaurar método original
    ConflictResolver.syncOrderWithConflictResolution = originalMethod;
  }
}); 