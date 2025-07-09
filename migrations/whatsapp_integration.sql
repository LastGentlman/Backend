-- ===== MIGRACIÓN PARA INTEGRACIÓN DE WHATSAPP =====
-- Ejecutar en Supabase SQL Editor

-- Tabla para logs de WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'delivered', 'read')),
  whatsapp_message_id TEXT,
  priority TEXT CHECK (priority IN ('critical', 'warning', 'report', 'business')),
  context JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_business_id ON whatsapp_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_created_at ON whatsapp_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_phone_number ON whatsapp_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_status ON whatsapp_logs(status);

-- Tabla para reglas de alerta
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('new_order', 'order_delayed', 'payment_received', 'low_stock', 'system_alert')),
  conditions JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para reglas de alerta
CREATE INDEX IF NOT EXISTS idx_alert_rules_business_id ON alert_rules(business_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_event_type ON alert_rules(event_type);
CREATE INDEX IF NOT EXISTS idx_alert_rules_is_active ON alert_rules(is_active);

-- Tabla para configuración de WhatsApp por negocio
CREATE TABLE IF NOT EXISTS business_whatsapp_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  phone_numbers TEXT[] NOT NULL DEFAULT '{}',
  business_hours JSONB NOT NULL DEFAULT '{"start": "09:00", "end": "18:00", "timezone": "America/Mexico_City"}',
  escalation JSONB NOT NULL DEFAULT '{"immediate": [], "delayed": [], "weekend": []}',
  auto_responses JSONB NOT NULL DEFAULT '{"enabled": true, "templates": {}}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para configuración
CREATE INDEX IF NOT EXISTS idx_business_whatsapp_config_business_id ON business_whatsapp_config(business_id);

-- Tabla para alertas programadas
CREATE TABLE IF NOT EXISTS scheduled_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  action JSONB NOT NULL,
  context JSONB NOT NULL DEFAULT '{}',
  execute_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed', 'cancelled')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  executed_at TIMESTAMP WITH TIME ZONE
);

-- Índices para alertas programadas
CREATE INDEX IF NOT EXISTS idx_scheduled_alerts_business_id ON scheduled_alerts(business_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_alerts_execute_at ON scheduled_alerts(execute_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_alerts_status ON scheduled_alerts(status);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar updated_at
CREATE TRIGGER update_alert_rules_updated_at 
  BEFORE UPDATE ON alert_rules 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_whatsapp_config_updated_at 
  BEFORE UPDATE ON business_whatsapp_config 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Políticas RLS (Row Level Security)
-- Nota: Ajustar según tu configuración de autenticación

-- Políticas para whatsapp_logs
ALTER TABLE whatsapp_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their business whatsapp logs" ON whatsapp_logs
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM employees 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can insert their business whatsapp logs" ON whatsapp_logs
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT business_id FROM employees 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Políticas para alert_rules
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their business alert rules" ON alert_rules
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM employees 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can manage their business alert rules" ON alert_rules
  FOR ALL USING (
    business_id IN (
      SELECT business_id FROM employees 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Políticas para business_whatsapp_config
ALTER TABLE business_whatsapp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their business whatsapp config" ON business_whatsapp_config
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM employees 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can manage their business whatsapp config" ON business_whatsapp_config
  FOR ALL USING (
    business_id IN (
      SELECT business_id FROM employees 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Políticas para scheduled_alerts
ALTER TABLE scheduled_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their business scheduled alerts" ON scheduled_alerts
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM employees 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can manage their business scheduled alerts" ON scheduled_alerts
  FOR ALL USING (
    business_id IN (
      SELECT business_id FROM employees 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Función para limpiar logs antiguos (opcional)
CREATE OR REPLACE FUNCTION cleanup_old_whatsapp_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM whatsapp_logs 
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  DELETE FROM scheduled_alerts 
  WHERE executed_at < NOW() - INTERVAL '30 days' 
  AND status IN ('executed', 'failed', 'cancelled');
END;
$$ LANGUAGE plpgsql;

-- Comentarios para documentación
COMMENT ON TABLE whatsapp_logs IS 'Registro de todos los mensajes de WhatsApp enviados y recibidos';
COMMENT ON TABLE alert_rules IS 'Reglas de alerta configuradas por cada negocio';
COMMENT ON TABLE business_whatsapp_config IS 'Configuración de WhatsApp específica por negocio';
COMMENT ON TABLE scheduled_alerts IS 'Alertas programadas para ejecución posterior';

-- Datos de ejemplo (opcional)
-- INSERT INTO business_whatsapp_config (business_id, phone_numbers, business_hours, escalation)
-- VALUES (
--   'your-business-id-here',
--   ARRAY['+525512345678'],
--   '{"start": "09:00", "end": "18:00", "timezone": "America/Mexico_City"}',
--   '{"immediate": ["+525512345678"], "delayed": ["+525512345679"], "weekend": ["+525512345678"]}'
-- ); 