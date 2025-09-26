/**
 * Test Script for Backup System
 * 
 * This script tests the backup system functionality
 */

import BackupService from '../services/BackupService.ts'

async function testBackupSystem() {
  console.log('🧪 Testing Backup System...')
  
  const testUserId = 'test-user-123'
  
  try {
    // Test 1: Create full backup
    console.log('\n📦 Test 1: Creating full backup...')
    const fullBackupResult = await BackupService.getInstance().createFullBackup(testUserId)
    
    if (fullBackupResult.success) {
      console.log('✅ Full backup created successfully')
      console.log(`   Backup ID: ${fullBackupResult.backupId}`)
      console.log(`   Size: ${fullBackupResult.size} bytes`)
      console.log(`   Checksum: ${fullBackupResult.checksum}`)
    } else {
      console.log('❌ Full backup failed:', fullBackupResult.error)
    }
    
    // Test 2: Create incremental backup
    console.log('\n🔄 Test 2: Creating incremental backup...')
    const incrementalBackupResult = await BackupService.getInstance().createIncrementalBackup(testUserId)
    
    if (incrementalBackupResult.success) {
      console.log('✅ Incremental backup created successfully')
      console.log(`   Backup ID: ${incrementalBackupResult.backupId}`)
      console.log(`   Size: ${incrementalBackupResult.size} bytes`)
    } else {
      console.log('❌ Incremental backup failed:', incrementalBackupResult.error)
    }
    
    // Test 3: List backups
    console.log('\n📋 Test 3: Listing backups...')
    const backups = await BackupService.getInstance().listUserBackups(testUserId)
    console.log(`✅ Found ${backups.length} backups`)
    
    backups.forEach((backup, index) => {
      console.log(`   ${index + 1}. ${backup.id} (${backup.type}) - ${backup.status}`)
    })
    
    // Test 4: Cleanup old backups
    console.log('\n🧹 Test 4: Cleaning up old backups...')
    const deletedCount = await BackupService.getInstance().cleanupOldBackups()
    console.log(`✅ Cleaned up ${deletedCount} old backups`)
    
    console.log('\n🎉 All backup system tests completed!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

// Run tests if this script is executed directly
if (import.meta.main) {
  await testBackupSystem()
}

export { testBackupSystem }
