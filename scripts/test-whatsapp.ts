#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { WhatsAppAlertsService } from "../services/WhatsAppAlertsService.ts";
import { AlertRulesService } from "../services/AlertRulesService.ts";

// ===== CONFIGURACIÓN =====
const env = await load();
for (const [key, value] of Object.entries(env)) {
  Deno.env.set(key, value);
}

const BASE_URL = Deno.env.get("API_BASE_URL") || "http://localhost:8000";
const TEST_BUSINESS_ID = "test-business-123";
const TEST_PHONE = Deno.env.get("TEST_PHONE") || "+525512345678";

// ===== FUNCIONES DE TEST =====

async function testWhatsAppService() {
  console.log("🧪 Probando WhatsAppAlertsService...");
  
  try {
    // Test 1: Enviar mensaje de prueba
    console.log("📱 Enviando mensaje de prueba...");
    const success = await WhatsAppAlertsService.sendMessage(
      TEST_PHONE,
      "🧪 Este es un mensaje de prueba desde PedidoList",
      'business'
    );
    
    console.log(success ? "✅ Mensaje enviado exitosamente" : "❌ Error enviando mensaje");
    
    // Test 2: Enviar alerta crítica
    console.log("🚨 Enviando alerta crítica...");
    await WhatsAppAlertsService.sendCriticalAlert(
      "Test Metric",
      150,
      100,
      "Verificar configuración"
    );
    
    console.log("✅ Alerta crítica enviada");
    
    // Test 3: Enviar warning
    console.log("⚠️ Enviando warning...");
    await WhatsAppAlertsService.sendWarningAlert(
      "Test Warning",
      75,
      50,
      "Monitorear métrica"
    );
    
    console.log("✅ Warning enviado");
    
  } catch (error) {
    console.error("❌ Error en WhatsAppAlertsService:", error);
  }
}

async function testAlertRulesService() {
  console.log("\n🧪 Probando AlertRulesService...");
  
  try {
    // Test 1: Crear reglas predeterminadas
    console.log("📋 Creando reglas predeterminadas...");
    await AlertRulesService.createDefaultRules(TEST_BUSINESS_ID, TEST_PHONE);
    console.log("✅ Reglas predeterminadas creadas");
    
    // Test 2: Obtener reglas activas
    console.log("📊 Obteniendo reglas activas...");
    const rules = await AlertRulesService.getActiveRules(TEST_BUSINESS_ID);
    console.log(`✅ ${rules.length} reglas activas encontradas`);
    
    // Test 3: Verificar configuración
    console.log("⚙️ Verificando configuración...");
    const hasConfig = await AlertRulesService.hasWhatsAppConfig(TEST_BUSINESS_ID);
    console.log(hasConfig ? "✅ Configuración encontrada" : "⚠️ Sin configuración");
    
    // Test 4: Obtener estadísticas
    console.log("📈 Obteniendo estadísticas...");
    const stats = await AlertRulesService.getRulesStats(TEST_BUSINESS_ID);
    console.log("✅ Estadísticas:", stats);
    
  } catch (error) {
    console.error("❌ Error en AlertRulesService:", error);
  }
}

async function testAPIEndpoints() {
  console.log("\n🧪 Probando endpoints de API...");
  
  const endpoints = [
    {
      name: "Templates",
      url: `${BASE_URL}/api/whatsapp/templates`,
      method: "GET"
    },
    {
      name: "Analytics",
      url: `${BASE_URL}/api/whatsapp/analytics/${TEST_BUSINESS_ID}`,
      method: "GET"
    },
    {
      name: "Alert Rules",
      url: `${BASE_URL}/api/whatsapp/alert-rules/${TEST_BUSINESS_ID}`,
      method: "GET"
    },
    {
      name: "Send Test Alert",
      url: `${BASE_URL}/api/whatsapp/send-test-alert`,
      method: "POST",
      body: {
        phoneNumber: TEST_PHONE,
        message: "🧪 Test desde script",
        priority: "warning"
      }
    }
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`📡 Probando ${endpoint.name}...`);
      
      const options: RequestInit = {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      if (endpoint.body) {
        options.body = JSON.stringify(endpoint.body);
      }
      
      const response = await fetch(endpoint.url, options);
      const data = await response.json();
      
      if (response.ok) {
        console.log(`✅ ${endpoint.name}: OK`);
        if (data.success !== undefined) {
          console.log(`   Success: ${data.success}`);
        }
      } else {
        console.log(`❌ ${endpoint.name}: ${response.status} - ${data.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.error(`❌ Error en ${endpoint.name}:`, error);
    }
  }
}

async function testDatabaseConnection() {
  console.log("\n🧪 Probando conexión a base de datos...");
  
  try {
    const { getSupabaseClient } = await import("../utils/supabase.ts");
    const supabase = getSupabaseClient();
    
    // Test básico de conectividad
    const { data: _data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);
    
    if (error) {
      console.log("❌ Error de conexión:", error.message);
    } else {
      console.log("✅ Conexión a base de datos exitosa");
    }
    
  } catch (error) {
    console.error("❌ Error conectando a base de datos:", error);
  }
}

function testEnvironmentVariables() {
  console.log("\n🧪 Verificando variables de entorno...");
  
  const requiredVars = [
    'META_WHATSAPP_TOKEN',
    'META_PHONE_NUMBER_ID',
    'META_APP_SECRET',
    'WEBHOOK_VERIFY_TOKEN',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  const missing = [];
  
  for (const varName of requiredVars) {
    const value = Deno.env.get(varName);
    if (value) {
      console.log(`✅ ${varName}: Configurado`);
    } else {
      console.log(`❌ ${varName}: No configurado`);
      missing.push(varName);
    }
  }
  
  if (missing.length > 0) {
    console.log(`\n⚠️ Variables faltantes: ${missing.join(', ')}`);
    console.log("   Configura estas variables en tu archivo .env");
  } else {
    console.log("\n✅ Todas las variables requeridas están configuradas");
  }
}

// ===== FUNCIÓN PRINCIPAL =====

async function runTests() {
  console.log("🚀 Iniciando tests de integración WhatsApp...\n");
  
  // Verificar variables de entorno
  await testEnvironmentVariables();
  
  // Verificar conexión a base de datos
  await testDatabaseConnection();
  
  // Probar servicios
  await testWhatsAppService();
  await testAlertRulesService();
  
  // Probar endpoints de API
  await testAPIEndpoints();
  
  console.log("\n🎉 Tests completados!");
  console.log("\n📋 Resumen:");
  console.log("- Verifica los logs arriba para ver el estado de cada test");
  console.log("- Si hay errores, revisa la configuración y variables de entorno");
  console.log("- Para más información, consulta la documentación en docs/WHATSAPP_INTEGRATION_README.md");
}

// ===== EJECUTAR TESTS =====

if (import.meta.main) {
  try {
    await runTests();
  } catch (error) {
    console.error("💥 Error fatal en tests:", error);
    Deno.exit(1);
  }
}

export { runTests }; 