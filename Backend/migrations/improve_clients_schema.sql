-- ===== IMPROVEMENTS TO CLIENTS SCHEMA =====
-- Additional constraints and indexes for better data integrity and performance

-- 1. Add unique constraint on (business_id, email) to prevent duplicate emails per business
-- Only applies when email is not null and not empty
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_business_email_unique 
ON clients(business_id, email) 
WHERE email IS NOT NULL AND email != '';

-- 2. Add unique constraint on (business_id, phone) to prevent duplicate phones per business
-- Only applies when phone is not null and not empty
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_business_phone_unique 
ON clients(business_id, phone) 
WHERE phone IS NOT NULL AND phone != '';

-- 3. Add composite index for common queries filtering by business and active status
-- This will improve performance for queries like "get all active clients for a business"
CREATE INDEX IF NOT EXISTS idx_clients_business_active 
ON clients(business_id, is_active) 
WHERE is_active = true;

-- 4. Add index for total_spent queries (useful for client analytics)
CREATE INDEX IF NOT EXISTS idx_clients_total_spent 
ON clients(business_id, total_spent DESC);

-- 5. Add index for last_order_date queries (useful for client activity analysis)
CREATE INDEX IF NOT EXISTS idx_clients_last_order_date 
ON clients(business_id, last_order_date DESC NULLS LAST);

-- Comments for documentation
COMMENT ON INDEX idx_clients_business_email_unique IS 'Ensures unique email addresses per business';
COMMENT ON INDEX idx_clients_business_phone_unique IS 'Ensures unique phone numbers per business';
COMMENT ON INDEX idx_clients_business_active IS 'Optimizes queries for active clients by business';
COMMENT ON INDEX idx_clients_total_spent IS 'Optimizes queries for client spending analytics';
COMMENT ON INDEX idx_clients_last_order_date IS 'Optimizes queries for client activity analysis';
