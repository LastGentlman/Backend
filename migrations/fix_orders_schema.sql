-- ===== FIXES FOR ORDERS SCHEMA =====
-- Addresses mismatches between database schema and frontend expectations

-- 1. Add missing fields
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS client_address text NULL,
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NULL DEFAULT now();

-- 2. Update status constraint to include all expected values
-- Drop the existing constraint first
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Add the updated constraint with all status values
ALTER TABLE public.orders 
ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'pending', 
    'preparing', 
    'in_progress',  -- Original schema value
    'ready', 
    'completed',    -- Original schema value
    'delivered', 
    'cancelled'
  )
);

-- 3. Create the correct trigger function for orders (matching existing pattern)
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_modified_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 4. Drop the old triggers and create the correct one
DROP TRIGGER IF EXISTS update_orders_last_modified ON public.orders;
DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;

CREATE TRIGGER update_orders_updated_at_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();

-- 5. Remove duplicate indexes
DROP INDEX IF EXISTS idx_orders_employee_id;

-- 6. Add additional performance indexes
CREATE INDEX IF NOT EXISTS idx_orders_client_name ON public.orders USING btree (client_name) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_orders_client_phone ON public.orders USING btree (client_phone) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_orders_total ON public.orders USING btree (total) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON public.orders USING btree (delivery_date) TABLESPACE pg_default;

-- 7. Add composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_orders_business_status ON public.orders USING btree (business_id, status) 
WHERE status != 'cancelled';

CREATE INDEX IF NOT EXISTS idx_orders_employee_date ON public.orders USING btree (employee_id, delivery_date DESC);

CREATE INDEX IF NOT EXISTS idx_orders_delivery_date_status ON public.orders USING btree (delivery_date, status) 
WHERE status IN ('pending', 'preparing', 'in_progress', 'ready');

CREATE INDEX IF NOT EXISTS idx_orders_modified_by ON public.orders USING btree (modified_by, last_modified_at DESC) 
WHERE modified_by IS NOT NULL;

-- 8. Add index for sync operations
CREATE INDEX IF NOT EXISTS idx_orders_sync_status ON public.orders USING btree (client_generated_id, last_modified_at) 
WHERE client_generated_id IS NOT NULL;

-- 9. Add check constraints for data validation
ALTER TABLE public.orders 
ADD CONSTRAINT orders_total_positive_check 
CHECK (total > 0);

ALTER TABLE public.orders 
ADD CONSTRAINT orders_delivery_date_future_check 
CHECK (delivery_date >= CURRENT_DATE - INTERVAL '30 days');

ALTER TABLE public.orders 
ADD CONSTRAINT orders_client_phone_format_check 
CHECK (client_phone IS NULL OR client_phone ~ '^[0-9]{7,20}$');

-- 10. Add comments for documentation
COMMENT ON COLUMN public.orders.client_address IS 'Client delivery address';
COMMENT ON COLUMN public.orders.updated_at IS 'Last update timestamp (matches frontend expectations)';
COMMENT ON COLUMN public.orders.last_modified_at IS 'Last modification timestamp for conflict resolution';
COMMENT ON COLUMN public.orders.modified_by IS 'User who last modified the order';
COMMENT ON COLUMN public.orders.client_generated_id IS 'Client-generated ID for offline sync';
COMMENT ON COLUMN public.orders.status IS 'Order status: pending, preparing, in_progress, ready, completed, delivered, cancelled';

-- 11. Update existing orders to have updated_at timestamp
UPDATE public.orders 
SET updated_at = COALESCE(last_modified_at, created_at)
WHERE updated_at IS NULL;
