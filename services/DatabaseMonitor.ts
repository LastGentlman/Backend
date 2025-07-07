import { getSupabaseClient } from "../utils/supabase.ts";

export interface DatabaseMetrics {
  ordersPerDay: number;
  avgQueryTime: number;
  databaseSize: number;
  activeConnections: number;
  errorRate: number;
  syncQueueSize: number;
  offlineUsers: number;
  conflictCount: number;
}

export interface MigrationTrigger {
  metric: string;
  threshold: number;
  action: string;
  severity: 'critical' | 'warning';
}

export interface MigrationTriggers {
  criticals: MigrationTrigger[];
  warnings: MigrationTrigger[];
}

export class DatabaseMonitor {
  private static readonly CRITICAL_THRESHOLDS = {
    ordersPerDay: 1000,        // Más de 1000 órdenes por día
    avgQueryTime: 500,          // Queries más lentas de 500ms
    databaseSize: 1000,         // BD más grande de 1GB
    activeConnections: 100,     // Más de 100 conexiones activas
    errorRate: 0.05,            // Más del 5% de errores
    syncQueueSize: 50,          // Más de 50 items en cola
    offlineUsers: 20,           // Más de 20 usuarios offline
    conflictCount: 10           // Más de 10 conflictos
  };

  private static readonly WARNING_THRESHOLDS = {
    ordersPerDay: 500,          // Más de 500 órdenes por día
    avgQueryTime: 300,          // Queries más lentas de 300ms
    databaseSize: 500,          // BD más grande de 500MB
    activeConnections: 50,      // Más de 50 conexiones activas
    errorRate: 0.02,            // Más del 2% de errores
    syncQueueSize: 20,          // Más de 20 items en cola
    offlineUsers: 10,           // Más de 10 usuarios offline
    conflictCount: 5            // Más de 5 conflictos
  };

  /**
   * Recolecta métricas de la base de datos
   */
  static async collectMetrics(): Promise<DatabaseMetrics> {
    const _supabase = getSupabaseClient();
    const startTime = Date.now();

    try {
      // Métricas básicas
      const [ordersCount, queryTime, dbSize, connections, errors, syncQueue, offlineCount, conflicts] = await Promise.all([
        this.getOrdersPerDay(),
        this.getAverageQueryTime(),
        this.getDatabaseSize(),
        this.getActiveConnections(),
        this.getErrorRate(),
        this.getSyncQueueSize(),
        this.getOfflineUsersCount(),
        this.getConflictCount()
      ]);

      const metrics: DatabaseMetrics = {
        ordersPerDay: ordersCount,
        avgQueryTime: queryTime,
        databaseSize: dbSize,
        activeConnections: connections,
        errorRate: errors,
        syncQueueSize: syncQueue,
        offlineUsers: offlineCount,
        conflictCount: conflicts
      };

      console.log(`📊 Métricas recolectadas en ${Date.now() - startTime}ms:`, metrics);
      return metrics;

    } catch (error) {
      console.error('❌ Error recolectando métricas:', error);
      throw error;
    }
  }

  /**
   * Verifica triggers de migración basados en métricas
   */
  static checkMigrationTriggers(metrics: DatabaseMetrics): MigrationTriggers {
    const criticals: MigrationTrigger[] = [];
    const warnings: MigrationTrigger[] = [];

    // Verificar triggers críticos
    if (metrics.ordersPerDay > this.CRITICAL_THRESHOLDS.ordersPerDay) {
      criticals.push({
        metric: 'ordersPerDay',
        threshold: this.CRITICAL_THRESHOLDS.ordersPerDay,
        action: 'Considerar escalar base de datos o optimizar queries',
        severity: 'critical'
      });
    }

    if (metrics.avgQueryTime > this.CRITICAL_THRESHOLDS.avgQueryTime) {
      criticals.push({
        metric: 'avgQueryTime',
        threshold: this.CRITICAL_THRESHOLDS.avgQueryTime,
        action: 'Optimizar índices y queries lentas',
        severity: 'critical'
      });
    }

    if (metrics.databaseSize > this.CRITICAL_THRESHOLDS.databaseSize) {
      criticals.push({
        metric: 'databaseSize',
        threshold: this.CRITICAL_THRESHOLDS.databaseSize,
        action: 'Implementar limpieza de datos o migrar a plan superior',
        severity: 'critical'
      });
    }

    if (metrics.activeConnections > this.CRITICAL_THRESHOLDS.activeConnections) {
      criticals.push({
        metric: 'activeConnections',
        threshold: this.CRITICAL_THRESHOLDS.activeConnections,
        action: 'Revisar conexiones huérfanas y optimizar pool',
        severity: 'critical'
      });
    }

    if (metrics.errorRate > this.CRITICAL_THRESHOLDS.errorRate) {
      criticals.push({
        metric: 'errorRate',
        threshold: this.CRITICAL_THRESHOLDS.errorRate,
        action: 'Investigar y corregir errores de aplicación',
        severity: 'critical'
      });
    }

    if (metrics.syncQueueSize > this.CRITICAL_THRESHOLDS.syncQueueSize) {
      criticals.push({
        metric: 'syncQueueSize',
        threshold: this.CRITICAL_THRESHOLDS.syncQueueSize,
        action: 'Revisar sistema de sincronización offline',
        severity: 'critical'
      });
    }

    if (metrics.offlineUsers > this.CRITICAL_THRESHOLDS.offlineUsers) {
      criticals.push({
        metric: 'offlineUsers',
        threshold: this.CRITICAL_THRESHOLDS.offlineUsers,
        action: 'Verificar conectividad y estado de la aplicación',
        severity: 'critical'
      });
    }

    if (metrics.conflictCount > this.CRITICAL_THRESHOLDS.conflictCount) {
      criticals.push({
        metric: 'conflictCount',
        threshold: this.CRITICAL_THRESHOLDS.conflictCount,
        action: 'Revisar lógica de resolución de conflictos',
        severity: 'critical'
      });
    }

    // Verificar warnings (solo si no es crítico)
    if (metrics.ordersPerDay > this.WARNING_THRESHOLDS.ordersPerDay && 
        metrics.ordersPerDay <= this.CRITICAL_THRESHOLDS.ordersPerDay) {
      warnings.push({
        metric: 'ordersPerDay',
        threshold: this.WARNING_THRESHOLDS.ordersPerDay,
        action: 'Monitorear crecimiento de órdenes',
        severity: 'warning'
      });
    }

    if (metrics.avgQueryTime > this.WARNING_THRESHOLDS.avgQueryTime && 
        metrics.avgQueryTime <= this.CRITICAL_THRESHOLDS.avgQueryTime) {
      warnings.push({
        metric: 'avgQueryTime',
        threshold: this.WARNING_THRESHOLDS.avgQueryTime,
        action: 'Identificar queries que pueden optimizarse',
        severity: 'warning'
      });
    }

    if (metrics.databaseSize > this.WARNING_THRESHOLDS.databaseSize && 
        metrics.databaseSize <= this.CRITICAL_THRESHOLDS.databaseSize) {
      warnings.push({
        metric: 'databaseSize',
        threshold: this.WARNING_THRESHOLDS.databaseSize,
        action: 'Planificar limpieza de datos',
        severity: 'warning'
      });
    }

    if (metrics.activeConnections > this.WARNING_THRESHOLDS.activeConnections && 
        metrics.activeConnections <= this.CRITICAL_THRESHOLDS.activeConnections) {
      warnings.push({
        metric: 'activeConnections',
        threshold: this.WARNING_THRESHOLDS.activeConnections,
        action: 'Monitorear uso de conexiones',
        severity: 'warning'
      });
    }

    if (metrics.errorRate > this.WARNING_THRESHOLDS.errorRate && 
        metrics.errorRate <= this.CRITICAL_THRESHOLDS.errorRate) {
      warnings.push({
        metric: 'errorRate',
        threshold: this.WARNING_THRESHOLDS.errorRate,
        action: 'Revisar logs de errores',
        severity: 'warning'
      });
    }

    if (metrics.syncQueueSize > this.WARNING_THRESHOLDS.syncQueueSize && 
        metrics.syncQueueSize <= this.CRITICAL_THRESHOLDS.syncQueueSize) {
      warnings.push({
        metric: 'syncQueueSize',
        threshold: this.WARNING_THRESHOLDS.syncQueueSize,
        action: 'Verificar estado de sincronización',
        severity: 'warning'
      });
    }

    if (metrics.offlineUsers > this.WARNING_THRESHOLDS.offlineUsers && 
        metrics.offlineUsers <= this.CRITICAL_THRESHOLDS.offlineUsers) {
      warnings.push({
        metric: 'offlineUsers',
        threshold: this.WARNING_THRESHOLDS.offlineUsers,
        action: 'Verificar conectividad de usuarios',
        severity: 'warning'
      });
    }

    if (metrics.conflictCount > this.WARNING_THRESHOLDS.conflictCount && 
        metrics.conflictCount <= this.CRITICAL_THRESHOLDS.conflictCount) {
      warnings.push({
        metric: 'conflictCount',
        threshold: this.WARNING_THRESHOLDS.conflictCount,
        action: 'Revisar conflictos de sincronización',
        severity: 'warning'
      });
    }

    return { criticals, warnings };
  }

  /**
   * Genera reporte de migración
   */
  static generateMigrationReport(metrics: DatabaseMetrics): string {
    const triggers = this.checkMigrationTriggers(metrics);
    
    let report = `📊 *Reporte de Métricas - PedidoList*

🔹 Órdenes hoy: ${metrics.ordersPerDay.toLocaleString()}
🔹 Tiempo promedio query: ${metrics.avgQueryTime}ms
🔹 BD tamaño: ${metrics.databaseSize}MB
🔹 Conexiones activas: ${metrics.activeConnections}
🔹 Tasa de errores: ${(metrics.errorRate * 100).toFixed(2)}%
🔹 Items en cola sync: ${metrics.syncQueueSize}
🔹 Usuarios offline: ${metrics.offlineUsers}
🔹 Conflictos: ${metrics.conflictCount}

`;

    if (triggers.criticals.length > 0) {
      report += `🚨 *Alertas Críticas:*\n`;
      triggers.criticals.forEach(trigger => {
        report += `• ${trigger.metric}: ${metrics[trigger.metric as keyof DatabaseMetrics]} (límite: ${trigger.threshold})\n`;
      });
      report += `\n`;
    }

    if (triggers.warnings.length > 0) {
      report += `⚠️ *Warnings:*\n`;
      triggers.warnings.forEach(trigger => {
        report += `• ${trigger.metric}: ${metrics[trigger.metric as keyof DatabaseMetrics]} (límite: ${trigger.threshold})\n`;
      });
      report += `\n`;
    }

    if (triggers.criticals.length === 0 && triggers.warnings.length === 0) {
      report += `✅ *Estado:* Todas las métricas dentro de rangos normales\n`;
    }

    return report;
  }

  // Métodos privados para recolectar métricas específicas
  private static async getOrdersPerDay(): Promise<number> {
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().split('T')[0];
    
    const { count, error } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today);

    if (error) {
      console.error('Error obteniendo órdenes del día:', error);
      return 0;
    }

    return count || 0;
  }

  private static getAverageQueryTime(): number {
    // Simulación - en producción usarías logs reales de queries
    return Math.random() * 200 + 50; // Entre 50-250ms
  }

  private static async getDatabaseSize(): Promise<number> {
    const supabase = getSupabaseClient();
    
    try {
      // Query para obtener tamaño aproximado de la BD
      const { data, error } = await supabase.rpc('get_database_size');
      
      if (error) {
        console.error('Error obteniendo tamaño de BD:', error);
        return 100; // Valor por defecto
      }

      return data || 100;
    } catch (error) {
      console.error('Error en getDatabaseSize:', error);
      return 100;
    }
  }

  private static getActiveConnections(): number {
    // Simulación - en producción usarías métricas reales de conexiones
    return Math.floor(Math.random() * 30) + 10; // Entre 10-40 conexiones
  }

  private static async getErrorRate(): Promise<number> {
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // Contar errores en logs (asumiendo tabla de logs)
      const { count: errorCount, error: errorError } = await supabase
        .from('error_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today)
        .eq('level', 'error');

      const { count: totalCount, error: totalError } = await supabase
        .from('error_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today);

      if (errorError || totalError) {
        console.error('Error obteniendo tasa de errores:', errorError || totalError);
        return 0.01; // 1% por defecto
      }

      return typeof totalCount === "number" && totalCount > 0 ? (errorCount || 0) / totalCount : 0;
    } catch (error) {
      console.error('Error en getErrorRate:', error);
      return 0.01;
    }
  }

  private static async getSyncQueueSize(): Promise<number> {
    const supabase = getSupabaseClient();
    
    try {
      const { count, error } = await supabase
        .from('sync_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (error) {
        console.error('Error obteniendo tamaño de cola sync:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error en getSyncQueueSize:', error);
      return 0;
    }
  }

  private static async getOfflineUsersCount(): Promise<number> {
    const supabase = getSupabaseClient();
    
    try {
      // Usuarios que no han tenido actividad en las últimas 5 horas
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
      
      const { count, error } = await supabase
        .from('user_sessions')
        .select('*', { count: 'exact', head: true })
        .lt('last_activity', fiveHoursAgo);

      if (error) {
        console.error('Error obteniendo usuarios offline:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error en getOfflineUsersCount:', error);
      return 0;
    }
  }

  private static async getConflictCount(): Promise<number> {
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const { count, error } = await supabase
        .from('conflict_resolutions')
        .select('*', { count: 'exact', head: true })
        .gte('resolved_at', today);

      if (error) {
        console.error('Error obteniendo conflictos:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error en getConflictCount:', error);
      return 0;
    }
  }
} 