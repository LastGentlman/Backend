-- ===== FIX RLS FOR SCHEMA CACHE TABLE =====
-- Migration: Enable Row Level Security on schema_cache table
-- Description: Fixes the security warning about RLS being disabled on public tables

-- Habilitar Row Level Security (RLS) en la tabla de caché
ALTER TABLE schema_cache ENABLE ROW LEVEL SECURITY;

-- Crear políticas RLS para usuarios autenticados
-- Esta política permite a todos los usuarios autenticados acceder al caché de schema
-- Usar DROP IF EXISTS para evitar errores si la política ya existe
DROP POLICY IF EXISTS "Authenticated users can access schema cache" ON schema_cache;

CREATE POLICY "Authenticated users can access schema cache" ON schema_cache
    FOR ALL USING (auth.role() = 'authenticated');

-- Verificar que RLS está habilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'schema_cache' 
AND schemaname = 'public';

-- Verificar que la política fue creada
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'schema_cache' 
AND schemaname = 'public';

-- ===== COMENTARIOS =====

COMMENT ON POLICY "Authenticated users can access schema cache" ON schema_cache IS 
'Allows authenticated users to access schema cache data for performance optimization';

/*
🎯 RLS FIX COMPLETADO

✅ RLS habilitado en schema_cache
✅ Política creada para usuarios autenticados
✅ Verificaciones incluidas

🔒 Seguridad mejorada:
- Solo usuarios autenticados pueden acceder al caché
- Previene acceso no autorizado a datos de schema
- Cumple con las mejores prácticas de Supabase

⚠️ Nota: Si ya tienes datos en schema_cache, esta migración los preservará
*/
