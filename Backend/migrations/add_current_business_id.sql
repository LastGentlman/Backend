-- ===== MIGRACIÓN: AGREGAR current_business_id A PROFILES =====
-- Ejecutar en Supabase SQL Editor

-- Agregar columna current_business_id a la tabla profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS current_business_id UUID REFERENCES businesses(id),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Crear índice para performance
CREATE INDEX IF NOT EXISTS idx_profiles_current_business_id ON profiles(current_business_id);

-- Actualizar RLS policies para la nueva columna
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can view own profile" ON profiles
FOR SELECT USING (id = (select auth.uid()));

CREATE POLICY "Users can update own profile" ON profiles  
FOR UPDATE USING (id = (select auth.uid()));

-- Comentario explicativo
COMMENT ON COLUMN profiles.current_business_id IS 'ID del negocio actual del usuario (para multi-business support)';
COMMENT ON COLUMN profiles.updated_at IS 'Timestamp de última actualización del perfil'; 