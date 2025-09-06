/**
 * Backup Routes
 * 
 * Handles backup-related API endpoints
 */

import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.ts'
import { csrfProtection } from '../utils/csrf.ts'
import BackupService from '../services/BackupService.ts'

const backupRoutes = new Hono()

// Apply middleware
backupRoutes.use('*', authMiddleware)
backupRoutes.use('*', csrfProtection)

/**
 * Create a manual backup
 * POST /api/backup/create
 */
backupRoutes.post('/create', async (c) => {
  try {
    const userId = c.get('userId') as string
    const { type = 'full' } = await c.req.json()
    
    if (!userId) {
      return c.json({ error: 'User not authenticated' }, 401)
    }
    
    const backupService = BackupService.getInstance()
    
    let result
    if (type === 'incremental') {
      result = await backupService.createIncrementalBackup(userId)
    } else {
      result = await backupService.createFullBackup(userId)
    }
    
    if (result.success) {
      return c.json({
        success: true,
        message: 'Backup created successfully',
        backupId: result.backupId,
        size: result.size,
        timestamp: result.timestamp
      })
    } else {
      return c.json({
        success: false,
        error: result.error || 'Backup creation failed'
      }, 500)
    }
    
  } catch (error) {
    console.error('Backup creation error:', error)
    return c.json({
      success: false,
      error: 'Internal server error'
    }, 500)
  }
})

/**
 * List user backups
 * GET /api/backup/list
 */
backupRoutes.get('/list', async (c) => {
  try {
    const userId = c.get('userId') as string
    
    if (!userId) {
      return c.json({ error: 'User not authenticated' }, 401)
    }
    
    const backupService = BackupService.getInstance()
    const backups = await backupService.listUserBackups(userId)
    
    return c.json({
      success: true,
      backups: backups.map(backup => ({
        id: backup.id,
        timestamp: backup.timestamp,
        type: backup.type,
        size: backup.size,
        compressed: backup.compressed,
        status: backup.status,
        tables: backup.tables
      }))
    })
    
  } catch (error) {
    console.error('Backup list error:', error)
    return c.json({
      success: false,
      error: 'Failed to list backups'
    }, 500)
  }
})

/**
 * Restore from backup
 * POST /api/backup/restore
 */
backupRoutes.post('/restore', async (c) => {
  try {
    const userId = c.get('userId') as string
    const { backupId } = await c.req.json()
    
    if (!userId) {
      return c.json({ error: 'User not authenticated' }, 401)
    }
    
    if (!backupId) {
      return c.json({ error: 'Backup ID is required' }, 400)
    }
    
    const backupService = BackupService.getInstance()
    const success = await backupService.restoreFromBackup(userId, backupId)
    
    if (success) {
      return c.json({
        success: true,
        message: 'Backup restored successfully'
      })
    } else {
      return c.json({
        success: false,
        error: 'Backup restore failed'
      }, 500)
    }
    
  } catch (error) {
    console.error('Backup restore error:', error)
    return c.json({
      success: false,
      error: 'Internal server error'
    }, 500)
  }
})

/**
 * Get backup status
 * GET /api/backup/status
 */
backupRoutes.get('/status', async (c) => {
  try {
    const userId = c.get('userId') as string
    
    if (!userId) {
      return c.json({ error: 'User not authenticated' }, 401)
    }
    
    const backupService = BackupService.getInstance()
    const backups = await backupService.listUserBackups(userId)
    
    // Calculate backup statistics
    const totalBackups = backups.length
    const successfulBackups = backups.filter(b => b.status === 'completed').length
    const failedBackups = backups.filter(b => b.status === 'failed').length
    const totalSize = backups.reduce((sum, b) => sum + b.size, 0)
    const lastBackup = backups.length > 0 ? backups[0] : null
    
    return c.json({
      success: true,
      status: {
        totalBackups,
        successfulBackups,
        failedBackups,
        totalSize,
        lastBackup: lastBackup ? {
          id: lastBackup.id,
          timestamp: lastBackup.timestamp,
          type: lastBackup.type,
          size: lastBackup.size
        } : null
      }
    })
    
  } catch (error) {
    console.error('Backup status error:', error)
    return c.json({
      success: false,
      error: 'Failed to get backup status'
    }, 500)
  }
})

/**
 * Clean up old backups (admin only)
 * DELETE /api/backup/cleanup
 */
backupRoutes.delete('/cleanup', async (c) => {
  try {
    const userId = c.get('userId') as string
    const userRole = c.get('userRole') as string
    
    if (!userId) {
      return c.json({ error: 'User not authenticated' }, 401)
    }
    
    // Only allow owners to clean up backups
    if (userRole !== 'owner') {
      return c.json({ error: 'Insufficient permissions' }, 403)
    }
    
    const backupService = BackupService.getInstance()
    const deletedCount = await backupService.cleanupOldBackups()
    
    return c.json({
      success: true,
      message: `Cleaned up ${deletedCount} old backups`
    })
    
  } catch (error) {
    console.error('Backup cleanup error:', error)
    return c.json({
      success: false,
      error: 'Failed to clean up backups'
    }, 500)
  }
})

export default backupRoutes
