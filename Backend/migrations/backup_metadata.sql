-- Migration: Create backup_metadata table
-- Description: Stores metadata about user backups for tracking and management

-- Create backup_metadata table
CREATE TABLE IF NOT EXISTS backup_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    backup_id TEXT NOT NULL,
    s3_key TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type TEXT NOT NULL CHECK (type IN ('full', 'incremental', 'manual')),
    size BIGINT NOT NULL DEFAULT 0,
    compressed BOOLEAN NOT NULL DEFAULT FALSE,
    checksum TEXT NOT NULL,
    tables TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_backup_metadata_user_id ON backup_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_backup_metadata_timestamp ON backup_metadata(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_backup_metadata_type ON backup_metadata(type);
CREATE INDEX IF NOT EXISTS idx_backup_metadata_status ON backup_metadata(status);
CREATE INDEX IF NOT EXISTS idx_backup_metadata_backup_id ON backup_metadata(backup_id);

-- Create unique constraint on backup_id per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_backup_metadata_user_backup_id 
ON backup_metadata(user_id, backup_id);

-- Enable Row Level Security (RLS)
ALTER TABLE backup_metadata ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only access their own backup metadata
CREATE POLICY "Users can view their own backup metadata" ON backup_metadata
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own backup metadata" ON backup_metadata
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own backup metadata" ON backup_metadata
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own backup metadata" ON backup_metadata
    FOR DELETE USING (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_backup_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_backup_metadata_updated_at
    BEFORE UPDATE ON backup_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_backup_metadata_updated_at();

-- Create function to clean up old backups (for automated cleanup)
CREATE OR REPLACE FUNCTION cleanup_old_backups(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM backup_metadata 
    WHERE timestamp < NOW() - INTERVAL '1 day' * retention_days
    AND status = 'completed';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON backup_metadata TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Create view for backup statistics
CREATE OR REPLACE VIEW backup_statistics AS
SELECT 
    user_id,
    COUNT(*) as total_backups,
    COUNT(*) FILTER (WHERE status = 'completed') as successful_backups,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_backups,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_backups,
    SUM(size) as total_size,
    MAX(timestamp) FILTER (WHERE status = 'completed') as last_successful_backup,
    MIN(timestamp) as first_backup
FROM backup_metadata
GROUP BY user_id;

-- Grant access to the view
GRANT SELECT ON backup_statistics TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE backup_metadata IS 'Stores metadata about user data backups stored in AWS S3';
COMMENT ON COLUMN backup_metadata.backup_id IS 'Unique identifier for the backup (used in S3 key)';
COMMENT ON COLUMN backup_metadata.s3_key IS 'S3 object key where the backup is stored';
COMMENT ON COLUMN backup_metadata.type IS 'Type of backup: full, incremental, or manual';
COMMENT ON COLUMN backup_metadata.size IS 'Size of the backup file in bytes';
COMMENT ON COLUMN backup_metadata.checksum IS 'SHA-256 checksum for data integrity verification';
COMMENT ON COLUMN backup_metadata.tables IS 'Array of table names included in the backup';
COMMENT ON COLUMN backup_metadata.status IS 'Current status of the backup operation';
COMMENT ON COLUMN backup_metadata.error IS 'Error message if backup failed';

COMMENT ON FUNCTION cleanup_old_backups(INTEGER) IS 'Cleans up old completed backups older than specified retention days';
COMMENT ON VIEW backup_statistics IS 'Provides backup statistics and metrics per user';
