-- ===== MIGRACIÓN: SISTEMA DE CÓDIGOS DE INVITACIÓN PARA NEGOCIOS =====
-- Ejecutar en Supabase SQL Editor

-- Tabla principal para códigos de invitación
CREATE TABLE IF NOT EXISTS business_invitation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code VARCHAR(11) NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$'),
  created_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'disabled')),
  role VARCHAR(20) DEFAULT 'seller' CHECK (role IN ('admin', 'seller')),
  notes TEXT,
  
  -- Campos de auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Índices para performance
  CONSTRAINT idx_business_invitation_codes_code UNIQUE (code),
  CONSTRAINT idx_business_invitation_codes_business_id UNIQUE (business_id, code)
);

-- Tabla para tracking de uso de códigos
CREATE TABLE IF NOT EXISTS business_invitation_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_code_id UUID NOT NULL REFERENCES business_invitation_codes(id) ON DELETE CASCADE,
  used_by UUID NOT NULL REFERENCES profiles(id),
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  
  -- Índices para performance
  CONSTRAINT idx_business_invitation_usage_code_id UNIQUE (invitation_code_id, used_by)
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_business_invitation_codes_business_id ON business_invitation_codes(business_id);
CREATE INDEX IF NOT EXISTS idx_business_invitation_codes_status ON business_invitation_codes(status);
CREATE INDEX IF NOT EXISTS idx_business_invitation_codes_expires_at ON business_invitation_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_business_invitation_codes_created_by ON business_invitation_codes(created_by);
CREATE INDEX IF NOT EXISTS idx_business_invitation_usage_used_by ON business_invitation_usage(used_by);

-- Habilitar RLS
ALTER TABLE business_invitation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_invitation_usage ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad para códigos de invitación
CREATE POLICY "Business owners can manage invitation codes" ON business_invitation_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.business_id = business_invitation_codes.business_id 
      AND employees.user_id = auth.uid()
      AND employees.role IN ('owner', 'admin')
      AND employees.is_active = true
    )
  );

-- Políticas para uso de códigos
CREATE POLICY "Anyone can view active invitation codes" ON business_invitation_codes
  FOR SELECT USING (status = 'active' AND expires_at > NOW());

CREATE POLICY "System can track invitation usage" ON business_invitation_usage
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Business owners can view invitation usage" ON business_invitation_usage
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.business_id = (
        SELECT business_id FROM business_invitation_codes 
        WHERE id = business_invitation_usage.invitation_code_id
      )
      AND employees.user_id = auth.uid()
      AND employees.role IN ('owner', 'admin')
      AND employees.is_active = true
    )
  );

-- Función para generar códigos únicos
CREATE OR REPLACE FUNCTION generate_invitation_code()
RETURNS VARCHAR(11) AS $$
DECLARE
  code VARCHAR(11);
  attempts INTEGER := 0;
  max_attempts INTEGER := 10;
BEGIN
  LOOP
    -- Generar código aleatorio: XXX-XXX-XXX
    code := 
      upper(substring(md5(random()::text) from 1 for 3)) || '-' ||
      upper(substring(md5(random()::text) from 1 for 3)) || '-' ||
      upper(substring(md5(random()::text) from 1 for 3));
    
    -- Verificar que no exista
    IF NOT EXISTS (SELECT 1 FROM business_invitation_codes WHERE business_invitation_codes.code = code) THEN
      RETURN code;
    END IF;
    
    attempts := attempts + 1;
    IF attempts >= max_attempts THEN
      RAISE EXCEPTION 'No se pudo generar un código único después de % intentos', max_attempts;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para limpiar códigos expirados
CREATE OR REPLACE FUNCTION cleanup_expired_invitation_codes()
RETURNS INTEGER AS $$
DECLARE
  cleaned_count INTEGER;
BEGIN
  UPDATE business_invitation_codes 
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active' AND expires_at <= NOW();
  
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para validar y usar un código de invitación
CREATE OR REPLACE FUNCTION use_invitation_code(
  invitation_code VARCHAR(11),
  user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  invitation_record RECORD;
  usage_record RECORD;
  result JSONB;
BEGIN
  -- Buscar el código de invitación
  SELECT * INTO invitation_record 
  FROM business_invitation_codes 
  WHERE code = invitation_code;
  
  -- Verificar que existe
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Código de invitación no encontrado'
    );
  END IF;
  
  -- Verificar que esté activo
  IF invitation_record.status != 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Código de invitación no está activo'
    );
  END IF;
  
  -- Verificar que no haya expirado
  IF invitation_record.expires_at <= NOW() THEN
    UPDATE business_invitation_codes 
    SET status = 'expired', updated_at = NOW()
    WHERE id = invitation_record.id;
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Código de invitación ha expirado'
    );
  END IF;
  
  -- Verificar que no se haya usado el máximo de veces
  IF invitation_record.current_uses >= invitation_record.max_uses THEN
    UPDATE business_invitation_codes 
    SET status = 'used', updated_at = NOW()
    WHERE id = invitation_record.id;
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Código de invitación ya ha sido usado el máximo de veces permitidas'
    );
  END IF;
  
  -- Verificar que el usuario no haya usado este código antes
  SELECT * INTO usage_record 
  FROM business_invitation_usage 
  WHERE invitation_code_id = invitation_record.id AND used_by = user_id;
  
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ya has usado este código de invitación'
    );
  END IF;
  
  -- Registrar el uso
  INSERT INTO business_invitation_usage (invitation_code_id, used_by)
  VALUES (invitation_record.id, user_id);
  
  -- Actualizar contador de usos
  UPDATE business_invitation_codes 
  SET 
    current_uses = current_uses + 1,
    status = CASE 
      WHEN current_uses + 1 >= max_uses THEN 'used'
      ELSE 'active'
    END,
    updated_at = NOW()
  WHERE id = invitation_record.id;
  
  -- Retornar éxito
  RETURN jsonb_build_object(
    'success', true,
    'business_id', invitation_record.business_id,
    'role', invitation_record.role,
    'message', 'Código de invitación usado exitosamente'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear job para limpiar códigos expirados (ejecutar cada hora)
-- Nota: En Supabase, esto se puede configurar con pg_cron o manualmente
-- SELECT cleanup_expired_invitation_codes();

-- Comentarios
COMMENT ON TABLE business_invitation_codes IS 'Códigos de invitación para unirse a negocios con expiración y límite de usos';
COMMENT ON TABLE business_invitation_usage IS 'Tracking de uso de códigos de invitación';
COMMENT ON FUNCTION generate_invitation_code() IS 'Genera códigos únicos de invitación en formato XXX-XXX-XXX';
COMMENT ON FUNCTION cleanup_expired_invitation_codes() IS 'Marca como expirados los códigos que han vencido';
COMMENT ON FUNCTION use_invitation_code() IS 'Valida y registra el uso de un código de invitación'; 