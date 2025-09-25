#!/bin/bash

# Script para desplegar la función de email a Supabase
echo "🚀 Desplegando función de email a Supabase..."

# Verificar que estamos en el directorio correcto
if [ ! -d "supabase/functions/send-notification-email" ]; then
    echo "❌ Error: No se encontró la función send-notification-email"
    echo "Asegúrate de estar en el directorio Backend/"
    exit 1
fi

# Desplegar la función
echo "📤 Subiendo función send-notification-email..."
npx supabase functions deploy send-notification-email

if [ $? -eq 0 ]; then
    echo "✅ Función desplegada exitosamente!"
    echo ""
    echo "📋 Variables de entorno necesarias en Supabase:"
    echo "   RESEND_API_KEY=tu_api_key_de_resend"
    echo "   RESEND_FROM_EMAIL=noreply@tudominio.com"
    echo "   RESEND_FROM_NAME=PedidoList"
    echo ""
    echo "🔗 URL de la función: https://tu-proyecto.supabase.co/functions/v1/send-notification-email"
else
    echo "❌ Error al desplegar la función"
    exit 1
fi 