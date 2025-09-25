-- Account Recovery Requests Table
-- Stores requests from users to recover their deleted accounts

CREATE TABLE IF NOT EXISTS account_recovery_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  business_name VARCHAR(255),
  phone_number VARCHAR(50),
  deletion_log_id UUID REFERENCES account_deletion_logs(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_account_recovery_requests_email ON account_recovery_requests(email);
CREATE INDEX IF NOT EXISTS idx_account_recovery_requests_status ON account_recovery_requests(status);
CREATE INDEX IF NOT EXISTS idx_account_recovery_requests_requested_at ON account_recovery_requests(requested_at);
CREATE INDEX IF NOT EXISTS idx_account_recovery_requests_deletion_log_id ON account_recovery_requests(deletion_log_id);

-- RLS (Row Level Security) policies
ALTER TABLE account_recovery_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own recovery requests" ON account_recovery_requests;
DROP POLICY IF EXISTS "Users can create recovery requests" ON account_recovery_requests;
DROP POLICY IF EXISTS "Owners can update recovery requests" ON account_recovery_requests;
DROP POLICY IF EXISTS "Owners can view all recovery requests" ON account_recovery_requests;

-- Policy: Users can only see their own recovery requests
CREATE POLICY "Users can view own recovery requests" ON account_recovery_requests
  FOR SELECT USING (email = auth.jwt() ->> 'email');

-- Policy: Users can create recovery requests
CREATE POLICY "Users can create recovery requests" ON account_recovery_requests
  FOR INSERT WITH CHECK (true);

-- Policy: Only owners can update recovery requests
CREATE POLICY "Owners can update recovery requests" ON account_recovery_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.user_id = auth.uid() 
      AND employees.role = 'owner'
      AND employees.is_active = true
    )
  );

-- Policy: Only owners can view all recovery requests
CREATE POLICY "Owners can view all recovery requests" ON account_recovery_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.user_id = auth.uid() 
      AND employees.role = 'owner'
      AND employees.is_active = true
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_account_recovery_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_account_recovery_requests_updated_at ON account_recovery_requests;
CREATE TRIGGER trigger_update_account_recovery_requests_updated_at
  BEFORE UPDATE ON account_recovery_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_account_recovery_requests_updated_at();

-- Function to check if recovery is still available
CREATE OR REPLACE FUNCTION is_recovery_available(deletion_date TIMESTAMP WITH TIME ZONE)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (NOW() - deletion_date) <= INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Function to get recovery status for an email
CREATE OR REPLACE FUNCTION get_recovery_status(user_email VARCHAR)
RETURNS TABLE (
  has_pending_request BOOLEAN,
  request_id UUID,
  status VARCHAR,
  message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE WHEN ar.status = 'pending' THEN true ELSE false END as has_pending_request,
    ar.id as request_id,
    ar.status,
    CASE 
      WHEN ar.status = 'pending' THEN 'Tu solicitud está siendo procesada'
      WHEN ar.status = 'approved' THEN 'Tu solicitud ha sido aprobada'
      WHEN ar.status = 'rejected' THEN 'Tu solicitud ha sido rechazada'
      ELSE 'Estado desconocido'
    END as message
  FROM account_recovery_requests ar
  WHERE ar.email = user_email
  ORDER BY ar.requested_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant necessary permissions
GRANT SELECT, INSERT ON account_recovery_requests TO authenticated;
GRANT SELECT, UPDATE ON account_recovery_requests TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE account_recovery_requests IS 'Stores requests from users to recover their deleted accounts';
COMMENT ON COLUMN account_recovery_requests.email IS 'Email of the user requesting recovery';
COMMENT ON COLUMN account_recovery_requests.reason IS 'Reason provided by user for account recovery';
COMMENT ON COLUMN account_recovery_requests.business_name IS 'Business name associated with the deleted account';
COMMENT ON COLUMN account_recovery_requests.phone_number IS 'Phone number for contact purposes';
COMMENT ON COLUMN account_recovery_requests.deletion_log_id IS 'Reference to the deletion log entry';
COMMENT ON COLUMN account_recovery_requests.status IS 'Current status of the recovery request';
COMMENT ON COLUMN account_recovery_requests.requested_at IS 'When the recovery was requested';
COMMENT ON COLUMN account_recovery_requests.processed_at IS 'When the request was processed by admin';
COMMENT ON COLUMN account_recovery_requests.processed_by IS 'Admin user who processed the request';
COMMENT ON COLUMN account_recovery_requests.admin_notes IS 'Notes from admin about the request';
