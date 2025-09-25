#!/usr/bin/env -S deno run --allow-all

/**
 * Script para iniciar el sistema de monitoreo continuo
 * Ejecutar con: deno run --allow-all scripts/start-monitoring.ts
 */

import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { getSupabaseClient } from "../utils/supabase.ts";
import { EnhancedDatabaseMonitor } from "../services/EnhancedDatabaseMonitor.ts";
import { WhatsAppAlertsService } from "../services/WhatsAppAlertsService.ts";

async function main() {
  console.log('🚀 Iniciando sistema de monitoreo PedidoList...');
  
  try {
    // Cargar variables de entorno
    const env = await load();
    for (const [key, value] of Object.entries(env)) {
      Deno.env.set(key, value);
    }
    console.log('✅ Variables de entorno cargadas');

    // Inicializar Supabase (lazy loading)
    getSupabaseClient();
    console.log('✅ Cliente Supabase listo (lazy loading)');

    // Verificar configuración de WhatsApp
    const whatsappToken = Deno.env.get('META_WHATSAPP_TOKEN');
    const phoneNumberId = Deno.env.get('META_PHONE_NUMBER_ID');
    
    if (!whatsappToken || !phoneNumberId) {
      console.warn('⚠️ Variables de WhatsApp no configuradas. Las alertas no se enviarán.');
      console.log('Configura META_WHATSAPP_TOKEN y META_PHONE_NUMBER_ID en tu .env');
    } else {
      console.log('✅ Configuración de WhatsApp detectada');
    }

    // Configurar webhook de WhatsApp
    await WhatsAppAlertsService.setupWebhook();
    console.log('✅ Webhook de WhatsApp configurado');

    // Ejecutar chequeo inicial
    console.log('🔍 Ejecutando chequeo inicial...');
    await EnhancedDatabaseMonitor.runDailyCheckWithWhatsApp();
    console.log('✅ Chequeo inicial completado');

    // Iniciar monitoreo continuo
    console.log('🔄 Iniciando monitoreo continuo...');
    await EnhancedDatabaseMonitor.startContinuousMonitoring();
    
    console.log('✅ Sistema de monitoreo iniciado correctamente');
    console.log('📊 Monitoreo ejecutándose cada 6 horas');
    console.log('📅 Reporte semanal programado para domingos a las 9 AM');
    console.log('📱 Alertas WhatsApp configuradas');
    
    // Mantener el proceso activo
    console.log('⏳ Presiona Ctrl+C para detener el monitoreo');
    
    // Manejar señales de terminación
    Deno.addSignalListener("SIGINT", async () => {
      console.log('\n🛑 Deteniendo sistema de monitoreo...');
      console.log('✅ Monitoreo detenido correctamente');
      Deno.exit(0);
    });

    Deno.addSignalListener("SIGTERM", async () => {
      console.log('\n🛑 Recibida señal de terminación...');
      console.log('✅ Monitoreo detenido correctamente');
      Deno.exit(0);
    });

    // Mantener el proceso vivo
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 60000)); // Esperar 1 minuto
      console.log('💓 Sistema de monitoreo activo...');
    }

  } catch (error) {
    console.error('❌ Error iniciando sistema de monitoreo:', error);
    
    // Enviar alerta de fallo si es posible
    try {
      await WhatsAppAlertsService.sendCriticalAlert(
        'sistema_monitoreo',
        1,
        0,
        'Error iniciando sistema de monitoreo. Revisar logs inmediatamente.'
      );
    } catch (alertError) {
      console.error('❌ No se pudo enviar alerta de fallo:', alertError);
    }
    
    Deno.exit(1);
  }
}

// Ejecutar el script
if (import.meta.main) {
  main();
} 