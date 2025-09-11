-- ===== FIXES FOR PRODUCTS SCHEMA =====
-- Addresses mismatches between database schema and frontend expectations

-- 1. Add missing updated_at field (frontend expects both last_modified_at and updated_at)
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NULL DEFAULT now();

-- 2. Handle category_id to categoryId conversion properly
-- Note: This handles the type conversion from VARCHAR to UUID
DO $$
BEGIN
    -- Check if category_id column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'products' 
               AND column_name = 'category_id' 
               AND table_schema = 'public') THEN
        
        -- Check the data type of the existing category_id column
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' 
                   AND column_name = 'category_id' 
                   AND data_type = 'uuid'
                   AND table_schema = 'public') THEN
            -- Column is already UUID type, just rename it
            ALTER TABLE public.products RENAME COLUMN category_id TO "categoryId";
            RAISE NOTICE 'Renamed category_id to categoryId (already UUID type)';
        ELSE
            -- Column is VARCHAR type, need to handle conversion
            -- First, check if there's data that would conflict
            IF NOT EXISTS (
                SELECT 1 FROM public.products 
                WHERE category_id IS NOT NULL 
                AND category_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            ) THEN
                -- All values are valid UUIDs or NULL, safe to convert
                -- Add new UUID column
                ALTER TABLE public.products ADD COLUMN "categoryId" uuid NULL;
                
                -- Copy data from old column to new column
                UPDATE public.products 
                SET "categoryId" = category_id::uuid 
                WHERE category_id IS NOT NULL;
                
                -- Drop old column
                ALTER TABLE public.products DROP COLUMN category_id;
                
                RAISE NOTICE 'Converted category_id from VARCHAR to UUID and renamed to categoryId';
            ELSE
                -- Keep both columns for now - category_id for legacy, categoryId for new
                ALTER TABLE public.products 
                ADD COLUMN IF NOT EXISTS "categoryId" uuid NULL;
                RAISE NOTICE 'Added categoryId column alongside existing category_id (VARCHAR)';
            END IF;
        END IF;
    ELSE
        -- Add categoryId column if category_id doesn't exist
        ALTER TABLE public.products 
        ADD COLUMN IF NOT EXISTS "categoryId" uuid NULL;
        RAISE NOTICE 'Added categoryId column';
    END IF;
END $$;

-- 3. Create the correct trigger function for products (matching existing pattern)
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_modified_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 4. Drop the old triggers and create the correct one
DROP TRIGGER IF EXISTS update_products_last_modified ON public.products;
DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;

CREATE TRIGGER update_products_updated_at_trigger
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION update_products_updated_at();

-- 5. Add additional performance indexes
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products USING btree (name) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_products_price ON public.products USING btree (price) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_products_stock ON public.products USING btree (stock) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products USING btree (is_active) TABLESPACE pg_default;

-- 6. Add composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_products_business_active ON public.products USING btree (business_id, is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_business_category ON public.products USING btree (business_id, "categoryId") 
WHERE "categoryId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products USING btree (created_at DESC) TABLESPACE pg_default;

-- 7. Add index for sync operations
CREATE INDEX IF NOT EXISTS idx_products_sync_status ON public.products USING btree (sync_status, last_modified_at) 
WHERE sync_status != 'synced';

-- 8. Add check constraints for data validation
ALTER TABLE public.products 
ADD CONSTRAINT products_price_positive_check 
CHECK (price > 0);

ALTER TABLE public.products 
ADD CONSTRAINT products_cost_non_negative_check 
CHECK (cost IS NULL OR cost >= 0);

ALTER TABLE public.products 
ADD CONSTRAINT products_stock_non_negative_check 
CHECK (stock >= 0);

ALTER TABLE public.products 
ADD CONSTRAINT products_tax_rate_valid_check 
CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 1));

ALTER TABLE public.products 
ADD CONSTRAINT products_sat_code_format_check 
CHECK (sat_code IS NULL OR sat_code ~ '^[0-9]{8}$');

-- 9. Add foreign key constraint for categoryId (if it exists and references business_categories)
DO $$
BEGIN
    -- Check if business_categories table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_name = 'business_categories' 
               AND table_schema = 'public') THEN
        
        -- Add foreign key constraint for categoryId
        ALTER TABLE public.products 
        ADD CONSTRAINT products_category_id_fkey 
        FOREIGN KEY ("categoryId") REFERENCES business_categories(id) ON DELETE SET NULL;
        
        RAISE NOTICE 'Added foreign key constraint for categoryId';
    ELSE
        RAISE NOTICE 'business_categories table not found - skipping categoryId foreign key';
    END IF;
END $$;

-- 10. Add comments for documentation
COMMENT ON COLUMN public.products."categoryId" IS 'Dynamic category reference (UUID)';
COMMENT ON COLUMN public.products.category IS 'Legacy category field (VARCHAR)';
COMMENT ON COLUMN public.products.sat_code IS 'SAT tax code for Mexican compliance (8 digits)';
COMMENT ON COLUMN public.products.tax_rate IS 'Tax rate for IVA calculations (0.16 = 16%)';
COMMENT ON COLUMN public.products.cost IS 'Product cost for profit margin calculations';
COMMENT ON COLUMN public.products.stock IS 'Current inventory stock level';
COMMENT ON COLUMN public.products.client_generated_id IS 'Client-generated ID for offline sync';
COMMENT ON COLUMN public.products.sync_status IS 'Sync status: pending, synced, error';
COMMENT ON COLUMN public.products.last_modified_at IS 'Last modification timestamp for conflict resolution';
COMMENT ON COLUMN public.products.updated_at IS 'Last update timestamp (matches frontend expectations)';
