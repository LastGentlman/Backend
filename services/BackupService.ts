/**
 * Backup Service
 * 
 * Handles automatic and manual backups to AWS S3
 * Features:
 * - Automatic daily backups
 * - Manual backup triggers
 * - Data compression
 * - Backup verification
 * - Retention policies
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSupabaseClient } from '../utils/supabase.ts'

export interface BackupConfig {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  retentionDays: number
  compressionEnabled: boolean
}

export interface BackupMetadata {
  id: string
  timestamp: string
  type: 'full' | 'incremental' | 'manual'
  size: number
  compressed: boolean
  checksum: string
  tables: string[]
  status: 'pending' | 'completed' | 'failed'
  error?: string
  s3Key?: string
}

export interface BackupResult {
  success: boolean
  backupId: string
  s3Key: string
  size: number
  checksum: string
  timestamp: string
  error?: string
}

export class BackupService {
  private static instance: BackupService
  private s3Client: S3Client
  private config: BackupConfig
  private supabase = getSupabaseClient()

  private constructor() {
    this.config = {
      bucket: Deno.env.get('S3_BUCKET') || 'pedidolist-backups',
      region: Deno.env.get('AWS_REGION') || 'us-east-1',
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID') || '',
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY') || '',
      retentionDays: parseInt(Deno.env.get('BACKUP_RETENTION_DAYS') || '30'),
      compressionEnabled: Deno.env.get('BACKUP_COMPRESSION') === 'true'
    }

    this.s3Client = new S3Client({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey
      }
    })
  }

  public static getInstance(): BackupService {
    if (!BackupService.instance) {
      BackupService.instance = new BackupService()
    }
    return BackupService.instance
  }

  /**
   * Create a full backup of all user data
   */
  async createFullBackup(userId: string): Promise<BackupResult> {
    const backupId = `backup-${userId}-${Date.now()}`
    const timestamp = new Date().toISOString()
    
    try {
      console.log(`🔄 Starting full backup for user ${userId}`)
      
      // Collect all user data
      const userData = await this.collectUserData(userId)
      
      // Serialize data
      const jsonData = JSON.stringify(userData, null, 2)
      
      // Compress if enabled
      let finalData = jsonData
      let compressed = false
      
      if (this.config.compressionEnabled) {
        // Compress data using gzip compression
        const encoder = new TextEncoder()
        const data = encoder.encode(jsonData)
        
        // Use CompressionStream for gzip compression
        const compressionStream = new CompressionStream('gzip')
        const writer = compressionStream.writable.getWriter()
        const reader = compressionStream.readable.getReader()
        
        // Write data to compression stream
        await writer.write(data)
        await writer.close()
        
        // Read compressed data
        const chunks: Uint8Array[] = []
        let done = false
        while (!done) {
          const { value, done: readerDone } = await reader.read()
          done = readerDone
          if (value) {
            chunks.push(value)
          }
        }
        
        // Combine chunks and convert to base64 for storage
        const compressedData = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
        let offset = 0
        for (const chunk of chunks) {
          compressedData.set(chunk, offset)
          offset += chunk.length
        }
        
        finalData = btoa(String.fromCharCode(...compressedData))
        compressed = true
      }
      
      // Calculate checksum
      const checksum = await this.calculateChecksum(finalData)
      
      // Upload to S3
      const s3Key = `backups/${userId}/${backupId}.json`
      await this.uploadToS3(s3Key, finalData, {
        'Content-Type': 'application/json',
        'x-backup-id': backupId,
        'x-user-id': userId,
        'x-backup-type': 'full',
        'x-timestamp': timestamp,
        'x-checksum': checksum,
        'x-compressed': compressed.toString()
      })
      
      // Store backup metadata
      await this.storeBackupMetadata({
        id: backupId,
        timestamp,
        type: 'full',
        size: finalData.length,
        compressed,
        checksum,
        tables: Object.keys(userData),
        status: 'completed'
      })
      
      console.log(`✅ Full backup completed: ${backupId}`)
      
      return {
        success: true,
        backupId,
        s3Key,
        size: finalData.length,
        checksum,
        timestamp
      }
      
    } catch (error) {
      console.error(`❌ Full backup failed for user ${userId}:`, error)
      
      // Store failed backup metadata
      await this.storeBackupMetadata({
        id: backupId,
        timestamp,
        type: 'full',
        size: 0,
        compressed: false,
        checksum: '',
        tables: [],
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      })
      
      return {
        success: false,
        backupId,
        s3Key: '',
        size: 0,
        checksum: '',
        timestamp,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Create an incremental backup (only changed data since last backup)
   */
  async createIncrementalBackup(userId: string): Promise<BackupResult> {
    const backupId = `incremental-${userId}-${Date.now()}`
    const timestamp = new Date().toISOString()
    
    try {
      console.log(`🔄 Starting incremental backup for user ${userId}`)
      
      // Get last backup timestamp
      const lastBackup = await this.getLastBackup(userId)
      const sinceTimestamp = lastBackup?.timestamp || new Date(0).toISOString()
      
      // Collect only changed data
      const changedData = await this.collectChangedData(userId, sinceTimestamp)
      
      if (Object.keys(changedData).length === 0) {
        console.log(`ℹ️ No changes detected for user ${userId}`)
        return {
          success: true,
          backupId,
          s3Key: '',
          size: 0,
          checksum: '',
          timestamp
        }
      }
      
      // Serialize data
      const jsonData = JSON.stringify(changedData, null, 2)
      const checksum = await this.calculateChecksum(jsonData)
      
      // Upload to S3
      const s3Key = `backups/${userId}/incremental/${backupId}.json`
      await this.uploadToS3(s3Key, jsonData, {
        'Content-Type': 'application/json',
        'x-backup-id': backupId,
        'x-user-id': userId,
        'x-backup-type': 'incremental',
        'x-timestamp': timestamp,
        'x-checksum': checksum,
        'x-since-timestamp': sinceTimestamp
      })
      
      // Store backup metadata
      await this.storeBackupMetadata({
        id: backupId,
        timestamp,
        type: 'incremental',
        size: jsonData.length,
        compressed: false,
        checksum,
        tables: Object.keys(changedData),
        status: 'completed'
      })
      
      console.log(`✅ Incremental backup completed: ${backupId}`)
      
      return {
        success: true,
        backupId,
        s3Key,
        size: jsonData.length,
        checksum,
        timestamp
      }
      
    } catch (error) {
      console.error(`❌ Incremental backup failed for user ${userId}:`, error)
      
      return {
        success: false,
        backupId,
        s3Key: '',
        size: 0,
        checksum: '',
        timestamp,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * List all backups for a user
   */
  async listUserBackups(userId: string): Promise<BackupMetadata[]> {
    try {
      const { data, error } = await this.supabase
        .from('backup_metadata')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
      
      if (error) throw error
      
      return data || []
    } catch (error) {
      console.error('Error listing backups:', error)
      return []
    }
  }

  /**
   * Restore user data from a backup
   */
  async restoreFromBackup(userId: string, backupId: string): Promise<boolean> {
    try {
      console.log(`🔄 Restoring backup ${backupId} for user ${userId}`)
      
      // Get backup metadata
      const metadata = await this.getBackupMetadata(backupId)
      if (!metadata) {
        throw new Error('Backup metadata not found')
      }
      
      // Download backup from S3
      if (!metadata.s3Key) {
        throw new Error('Backup S3 key not found')
      }
      const backupData = await this.downloadFromS3(metadata.s3Key)
      
      // Verify checksum
      const currentChecksum = await this.calculateChecksum(backupData)
      if (currentChecksum !== metadata.checksum) {
        throw new Error('Backup checksum verification failed')
      }
      
      // Parse and restore data
      const userData = JSON.parse(backupData)
      await this.restoreUserData(userId, userData)
      
      console.log(`✅ Backup restored successfully: ${backupId}`)
      return true
      
    } catch (error) {
      console.error(`❌ Backup restore failed:`, error)
      return false
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupOldBackups(): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays)
    
    try {
      // Get old backups from database
      const { data: oldBackups, error } = await this.supabase
        .from('backup_metadata')
        .select('*')
        .lt('timestamp', cutoffDate.toISOString())
      
      if (error) throw error
      
      let deletedCount = 0
      
      for (const backup of oldBackups || []) {
        try {
          // Delete from S3
          await this.deleteFromS3(backup.s3_key)
          
          // Delete metadata
          await this.supabase
            .from('backup_metadata')
            .delete()
            .eq('id', backup.id)
          
          deletedCount++
        } catch (error) {
          console.error(`Failed to delete backup ${backup.id}:`, error)
        }
      }
      
      console.log(`🧹 Cleaned up ${deletedCount} old backups`)
      return deletedCount
      
    } catch (error) {
      console.error('Error cleaning up old backups:', error)
      return 0
    }
  }

  /**
   * Collect all user data for backup
   */
  private async collectUserData(userId: string): Promise<Record<string, unknown[]>> {
    const userData: Record<string, unknown[]> = {}
    
    // Define tables to backup
    const tables = [
      'profiles',
      'businesses',
      'products',
      'clients',
      'orders',
      'order_items',
      'notifications',
      'user_settings'
    ]
    
    for (const table of tables) {
      try {
        const { data, error } = await this.supabase
          .from(table)
          .select('*')
          .eq('user_id', userId)
        
        if (error) {
          console.warn(`Warning: Could not backup table ${table}:`, error instanceof Error ? error.message : String(error))
          userData[table] = []
        } else {
          userData[table] = data || []
        }
      } catch (error) {
        console.warn(`Warning: Could not backup table ${table}:`, error instanceof Error ? error.message : String(error))
        userData[table] = []
      }
    }
    
    return userData
  }

  /**
   * Collect only changed data since timestamp
   */
  private async collectChangedData(userId: string, sinceTimestamp: string): Promise<Record<string, unknown[]>> {
    const changedData: Record<string, unknown[]> = {}
    
    // Define tables with updated_at columns
    const tablesWithTimestamps = [
      'profiles',
      'businesses', 
      'products',
      'clients',
      'orders',
      'order_items',
      'notifications'
    ]
    
    for (const table of tablesWithTimestamps) {
      try {
        const { data, error } = await this.supabase
          .from(table)
          .select('*')
          .eq('user_id', userId)
          .gte('updated_at', sinceTimestamp)
        
        if (!error && data && data.length > 0) {
          changedData[table] = data
        }
      } catch (error) {
        console.warn(`Warning: Could not check changes in table ${table}:`, error instanceof Error ? error.message : String(error))
      }
    }
    
    return changedData
  }

  /**
   * Upload data to S3
   */
  private async uploadToS3(key: string, data: string, metadata: Record<string, string>): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: data,
      ContentType: 'application/json',
      Metadata: metadata
    })
    
    await this.s3Client.send(command)
  }

  /**
   * Download data from S3
   */
  private async downloadFromS3(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key
    })
    
    const response = await this.s3Client.send(command)
    const body = await response.Body?.transformToString()
    
    if (!body) {
      throw new Error('Empty response from S3')
    }
    
    // Check if data is compressed (base64 encoded gzip)
    const isCompressed = response.Metadata?.['x-compressed'] === 'true'
    
    if (isCompressed) {
      // Decompress gzip data
      const compressedData = Uint8Array.from(atob(body), c => c.charCodeAt(0))
      
      const decompressionStream = new DecompressionStream('gzip')
      const writer = decompressionStream.writable.getWriter()
      const reader = decompressionStream.readable.getReader()
      
      // Write compressed data to decompression stream
      await writer.write(compressedData)
      await writer.close()
      
      // Read decompressed data
      const chunks: Uint8Array[] = []
      let done = false
      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        if (value) {
          chunks.push(value)
        }
      }
      
      // Combine chunks and convert to string
      const decompressedData = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
      let offset = 0
      for (const chunk of chunks) {
        decompressedData.set(chunk, offset)
        offset += chunk.length
      }
      
      return new TextDecoder().decode(decompressedData)
    }
    
    return body
  }

  /**
   * Delete data from S3
   */
  private async deleteFromS3(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key
    })
    
    await this.s3Client.send(command)
  }

  /**
   * Calculate checksum for data integrity
   */
  private async calculateChecksum(data: string): Promise<string> {
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(data)
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Store backup metadata in database
   */
  private storeBackupMetadata(metadata: BackupMetadata & { user_id?: string }): void {
    // This would need to be implemented based on your database schema
    // For now, we'll just log it
    console.log('Backup metadata:', metadata)
  }

  /**
   * Get backup metadata by ID
   */
  private getBackupMetadata(_backupId: string): BackupMetadata | null {
    // This would need to be implemented based on your database schema
    return null
  }

  /**
   * Get last backup for user
   */
  private getLastBackup(_userId: string): BackupMetadata | null {
    // This would need to be implemented based on your database schema
    return null
  }

  /**
   * Restore user data from backup
   */
  private restoreUserData(userId: string, userData: Record<string, unknown[]>): void {
    // This would need to be implemented carefully to avoid data conflicts
    console.log('Restoring user data:', userId, Object.keys(userData))
  }
}

export default BackupService
