/**
 * Data Export Service
 * Exports user data before account deletion for compliance (GDPR, CCPA)
 */

interface ProfileData {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  settings: Record<string, unknown> | null;
}

interface BusinessData {
  employee_role: string;
  business_id: string;
  business_name: string | null;
  joined_at: string;
  is_active: boolean;
}

interface OrderData {
  id: string;
  status: string;
  total: number;
  created_at: string;
  [key: string]: unknown;
}

interface UserDataExport {
  user_id: string;
  user_email: string;
  profile_data: ProfileData;
  business_data?: BusinessData;
  orders_data?: OrderData[];
  export_date: string;
  export_format: 'json' | 'csv';
  file_path?: string;
}

interface ExportOptions {
  includeOrders?: boolean;
  includeBusinessData?: boolean;
  format?: 'json' | 'csv';
  compress?: boolean;
}

export class DataExportService {
  private static instance: DataExportService;
  private exportPath: string;

  private constructor() {
    this.exportPath = Deno.env.get('DATA_EXPORT_PATH') || './exports';
  }

  public static getInstance(): DataExportService {
    if (!DataExportService.instance) {
      DataExportService.instance = new DataExportService();
    }
    return DataExportService.instance;
  }

  /**
   * Export user data before account deletion
   */
  async exportUserData(userId: string, options: ExportOptions = {}): Promise<UserDataExport> {
    try {
      console.log(`📊 Starting data export for user: ${userId}`);

      const supabase = await import('../utils/supabase.ts').then(m => m.getSupabaseClient());

      // 1. Get user profile data
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        throw new Error(`Error fetching profile: ${profileError.message}`);
      }

      // 2. Get business data if user is employee
      let businessData: BusinessData | undefined = undefined;
      if (options.includeBusinessData) {
        const { data: employee } = await supabase
          .from('employees')
          .select(`
            *,
            business:businesses(*)
          `)
          .eq('user_id', userId)
          .eq('is_active', true)
          .single();

        if (employee) {
          businessData = {
            employee_role: employee.role,
            business_id: employee.business_id,
            business_name: employee.business?.name,
            joined_at: employee.created_at,
            is_active: employee.is_active
          };
        }
      }

      // 3. Get orders data if requested
      let ordersData: OrderData[] | undefined = undefined;
      if (options.includeOrders && businessData?.business_id) {
        const { data: orders } = await supabase
          .from('orders')
          .select('*')
          .eq('business_id', businessData.business_id)
          .order('created_at', { ascending: false });

        ordersData = orders || [];
      }

      // 4. Prepare export data
      const exportData: UserDataExport = {
        user_id: userId,
        user_email: profile.email,
        profile_data: {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          avatar_url: profile.avatar_url,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
          settings: profile.settings
        },
        business_data: businessData,
        orders_data: ordersData,
        export_date: new Date().toISOString(),
        export_format: options.format || 'json'
      };

      // 5. Generate file
      const fileName = `user_export_${userId}_${Date.now()}.${options.format || 'json'}`;
      const filePath = `${this.exportPath}/${fileName}`;

      let fileContent: string;
      if (options.format === 'csv') {
        fileContent = this.convertToCSV(exportData);
      } else {
        fileContent = JSON.stringify(exportData, null, 2);
      }

      // 6. Save file (in production, save to cloud storage)
      await this.saveFile(filePath, fileContent, options.compress);
      exportData.file_path = filePath;

      console.log(`✅ Data export completed for user: ${userId}`);
      return exportData;

    } catch (error) {
      console.error(`❌ Error exporting data for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Convert export data to CSV format
   */
  private convertToCSV(data: UserDataExport): string {
    const csvRows: string[] = [];

    // Profile data
    csvRows.push('Section,Field,Value');
    csvRows.push('Profile,User ID,' + data.user_id);
    csvRows.push('Profile,Email,' + data.user_email);
    csvRows.push('Profile,Name,' + (data.profile_data.name || ''));
    csvRows.push('Profile,Created At,' + data.profile_data.created_at);
    csvRows.push('Profile,Updated At,' + data.profile_data.updated_at);

    // Business data
    if (data.business_data) {
      csvRows.push('Business,Role,' + data.business_data.employee_role);
      csvRows.push('Business,Business ID,' + data.business_data.business_id);
      csvRows.push('Business,Business Name,' + (data.business_data.business_name || ''));
      csvRows.push('Business,Joined At,' + data.business_data.joined_at);
      csvRows.push('Business,Is Active,' + data.business_data.is_active);
    }

    // Orders data
    if (data.orders_data && data.orders_data.length > 0) {
      csvRows.push('Orders,Total Orders,' + data.orders_data.length);
      
      // Add order details
      data.orders_data.forEach((order, index) => {
        csvRows.push(`Order ${index + 1},Order ID,${order.id}`);
        csvRows.push(`Order ${index + 1},Status,${order.status}`);
        csvRows.push(`Order ${index + 1},Total,${order.total}`);
        csvRows.push(`Order ${index + 1},Created At,${order.created_at}`);
      });
    }

    return csvRows.join('\n');
  }

  /**
   * Save file to storage (local or cloud)
   */
  private async saveFile(filePath: string, content: string, _compress: boolean = false): Promise<void> {
    try {
      const storageType = Deno.env.get('STORAGE_TYPE') || 'local';
      
      if (storageType === 's3') {
        // Save to AWS S3
        await this.saveToS3(filePath, content);
      } else {
        // Save to local filesystem
        await Deno.mkdir(this.exportPath, { recursive: true });
        await Deno.writeTextFile(filePath, content);
        console.log(`💾 File saved locally: ${filePath}`);
      }
    } catch (error) {
      console.error('Error saving export file:', error);
      throw error;
    }
  }

  /**
   * Save file to AWS S3
   */
  private async saveToS3(filePath: string, content: string): Promise<void> {
    try {
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      
      const s3Client = new S3Client({ 
        region: Deno.env.get('AWS_REGION') || 'us-east-1',
        credentials: {
          accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID') || '',
          secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY') || ''
        }
      });

      const fileName = filePath.split('/').pop() || 'export.json';
      const key = `exports/${fileName}`;

      await s3Client.send(new PutObjectCommand({
        Bucket: Deno.env.get('S3_BUCKET') || 'pedidolist-users-backup',
        Key: key,
        Body: content,
        ContentType: 'application/json'
      }));
      
      console.log(`☁️ File saved to S3: s3://${Deno.env.get('S3_BUCKET')}/${key}`);
    } catch (error) {
      console.error('Error saving to S3:', error);
      throw error;
    }
  }

  /**
   * Get export file
   */
  async getExportFile(filePath: string): Promise<string | null> {
    try {
      const content = await Deno.readTextFile(filePath);
      return content;
    } catch (error) {
      console.error('Error reading export file:', error);
      return null;
    }
  }

  /**
   * Delete export file
   */
  async deleteExportFile(filePath: string): Promise<boolean> {
    try {
      await Deno.remove(filePath);
      console.log(`🗑️ Export file deleted: ${filePath}`);
      return true;
    } catch (error) {
      console.error('Error deleting export file:', error);
      return false;
    }
  }

  /**
   * Clean up old export files (older than 90 days)
   */
  async cleanupOldExports(): Promise<number> {
    try {
      const files = [];
      for await (const entry of Deno.readDir(this.exportPath)) {
        if (entry.isFile && entry.name.endsWith('.json')) {
          const filePath = `${this.exportPath}/${entry.name}`;
          try {
            const stat = await Deno.stat(filePath);
            const daysOld = (Date.now() - (stat.mtime?.getTime() || Date.now())) / (1000 * 60 * 60 * 24);
            
            if (daysOld > 90) {
              files.push(filePath);
            }
          } catch (statError) {
            console.warn(`Could not stat file ${filePath}:`, statError);
          }
        }
      }

      let deletedCount = 0;
      for (const filePath of files) {
        if (await this.deleteExportFile(filePath)) {
          deletedCount++;
        }
      }

      console.log(`🧹 Cleaned up ${deletedCount} old export files`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old exports:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const dataExportService = DataExportService.getInstance(); 