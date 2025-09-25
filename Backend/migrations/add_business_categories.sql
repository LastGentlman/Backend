-- ===== MIGRACIÓN: CATEGORÍAS DINÁMICAS POR TIPO DE NEGOCIO =====
-- Ejecutar en Supabase SQL Editor después del esquema principal

-- Agregar campos a tabla businesses
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS business_type VARCHAR(50) DEFAULT 'retail',
ADD COLUMN IF NOT EXISTS tax_regime_code VARCHAR(10);

-- Nueva tabla: business_categories (categorías por negocio)
CREATE TABLE IF NOT EXISTS business_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id VARCHAR(100) NOT NULL,
  category_name VARCHAR(255) NOT NULL,
  icon VARCHAR(10),
  sat_code VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  
  -- Campos de sincronización offline
  client_generated_id VARCHAR(255) UNIQUE,
  last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status VARCHAR(20) DEFAULT 'synced',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(business_id, category_id)
);

-- Actualizar tabla products para categorías dinámicas
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS category_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS sat_code VARCHAR(20) DEFAULT '50000000',
ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,4) DEFAULT 0.16,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS cost DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS client_generated_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'synced';

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_business_categories_business_id ON business_categories(business_id);
CREATE INDEX IF NOT EXISTS idx_business_categories_category_id ON business_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_business_categories_sync ON business_categories(sync_status);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sync ON products(sync_status);
CREATE INDEX IF NOT EXISTS idx_businesses_type ON businesses(business_type);

-- Habilitar RLS en business_categories
ALTER TABLE business_categories ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad para business_categories
CREATE POLICY "Users can manage business categories in their businesses" ON business_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.business_id = business_categories.business_id 
      AND employees.user_id = auth.uid()
      AND employees.is_active = true
    )
  );

-- Función para actualizar last_modified_at en business_categories
CREATE TRIGGER update_business_categories_last_modified
  BEFORE UPDATE ON business_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_last_modified();

-- Función para actualizar last_modified_at en products
CREATE TRIGGER update_products_last_modified
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_last_modified();

-- Actualizar sync_queue para soportar business_category
ALTER TABLE sync_queue 
DROP CONSTRAINT IF EXISTS sync_queue_entity_type_check;

ALTER TABLE sync_queue 
ADD CONSTRAINT sync_queue_entity_type_check 
CHECK (entity_type IN ('order', 'product', 'business_category'));

-- Migrar categorías existentes a category_id
UPDATE products SET category_id = category WHERE category IS NOT NULL AND category_id IS NULL;

-- Comentarios
COMMENT ON TABLE business_categories IS 'Categorías dinámicas configurables por tipo de negocio con códigos SAT';
COMMENT ON COLUMN business_categories.sat_code IS 'Código SAT para facturación automática';
COMMENT ON COLUMN products.category_id IS 'Referencia a categoría dinámica (reemplaza category)';
COMMENT ON COLUMN products.sat_code IS 'Código SAT para facturación automática';
COMMENT ON COLUMN products.tax_rate IS 'Tasa de impuesto (0.16 = 16% IVA)'; 