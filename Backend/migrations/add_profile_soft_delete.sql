-- ===== MIGRACIÓN: AGREGAR SOFT DELETE A PROFILES =====
-- Ejecutar en Supabase SQL Editor

-- Agregar columnas para soft delete en la tabla profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Crear índices para performance
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON profiles(deleted_at);

-- Actualizar RLS policies para incluir soft delete
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can view own profile" ON profiles
FOR SELECT USING (
  id = (select auth.uid()) 
  AND is_active = true
);

CREATE POLICY "Users can update own profile" ON profiles  
FOR UPDATE USING (
  id = (select auth.uid()) 
  AND is_active = true
);

-- Comentarios explicativos
COMMENT ON COLUMN profiles.is_active IS 'Indica si el perfil está activo (soft delete)';
COMMENT ON COLUMN profiles.deleted_at IS 'Timestamp de cuando se eliminó el perfil (soft delete)';
