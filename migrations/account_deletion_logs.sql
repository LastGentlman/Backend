-- Migration: Create simple account deletion logs table for compliance
-- This tracks all account deletions without complex dashboard features

CREATE TABLE IF NOT EXISTS account_deletion_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    user_email TEXT NOT NULL,
    business_id UUID,
    business_name TEXT,
    user_role TEXT, -- owner, admin, seller, or null if not employee
    deletion_reason TEXT,
    total_orders INTEGER DEFAULT 0,
    account_age_days INTEGER,
    ip_address INET,
    user_agent TEXT,
    deletion_method TEXT DEFAULT 'self_deletion', -- self_deletion, admin_deletion, system_deletion
    grace_period_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    grace_period_end TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '90 days'),
    data_exported BOOLEAN DEFAULT FALSE,
    data_export_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_account_deletion_logs_user_id ON account_deletion_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_account_deletion_logs_business_id ON account_deletion_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_account_deletion_logs_created_at ON account_deletion_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_account_deletion_logs_grace_period_end ON account_deletion_logs(grace_period_end);

-- RLS (Row Level Security) - Only system can insert, owners can view their business
ALTER TABLE account_deletion_logs ENABLE ROW LEVEL SECURITY;

-- Policy: System can insert deletion logs
CREATE POLICY "system_can_insert_deletion_logs" ON account_deletion_logs
    FOR INSERT
    WITH CHECK (true);

-- Policy: Business owners can view deletion logs from their business
CREATE POLICY "business_owners_can_view_deletion_logs" ON account_deletion_logs
    FOR SELECT
    USING (
        business_id IN (
            SELECT business_id 
            FROM employees 
            WHERE user_id = auth.uid() 
            AND role = 'owner' 
            AND is_active = true
        )
    );

-- Function to calculate account age
CREATE OR REPLACE FUNCTION calculate_account_age(user_created_at TIMESTAMP WITH TIME ZONE)
RETURNS INTEGER AS $$
BEGIN
    RETURN EXTRACT(DAY FROM (NOW() - user_created_at));
END;
$$ LANGUAGE plpgsql;

-- Function to get user deletion statistics
CREATE OR REPLACE FUNCTION get_user_deletion_stats(p_user_id UUID)
RETURNS TABLE (
    total_orders INTEGER,
    account_age_days INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(o.total_orders, 0) as total_orders,
        calculate_account_age(u.created_at) as account_age_days
    FROM auth.users u
    LEFT JOIN (
        SELECT 
            business_id,
            COUNT(*) as total_orders
        FROM orders 
        WHERE business_id IN (
            SELECT business_id FROM employees WHERE user_id = p_user_id AND is_active = true
        )
        GROUP BY business_id
    ) o ON true
    WHERE u.id = p_user_id;
END;
$$ LANGUAGE plpgsql; 