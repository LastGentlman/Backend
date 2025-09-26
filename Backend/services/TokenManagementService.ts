import { getSupabaseClient } from '../utils/supabase.ts';
// Using in-memory storage for token management (can be moved to Supabase later)

export interface TokenInfo {
  userId: string;
  tokenType: 'access' | 'refresh';
  issuedAt: number;
  expiresAt: number;
  isBlacklisted: boolean;
}

export interface CompromisedAccount {
  userId: string;
  reason: string;
  markedAt: Date;
  markedBy: string;
}

// In-memory stores (for now - can be moved to Supabase later)
const blacklistSet = new Set<string>();
const compromisedSet = new Set<string>();
const blacklistMeta = new Map<string, { reason: string; timestamp: number }>();
const compromisedMeta = new Map<string, { userId: string; reason: string; markedAt: string; markedBy: string }>();


export class TokenManagementService {
  private static instance: TokenManagementService;
  private supabase: ReturnType<typeof getSupabaseClient> | null = null;
  private gracePeriodCache: Map<string, any> | null = null;

  private constructor() {}

  private getSupabase() {
    if (!this.supabase) {
      this.supabase = getSupabaseClient();
    }
    return this.supabase!;
  }

  public static getInstance(): TokenManagementService {
    if (!TokenManagementService.instance) {
      TokenManagementService.instance = new TokenManagementService();
    }
    return TokenManagementService.instance;
  }

  /**
   * Validates token structure and type
   */
  public validateTokenStructure(token: string): { isValid: boolean; type: 'access' | 'refresh' | 'invalid'; reason?: string } {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { isValid: false, type: 'invalid', reason: 'Invalid JWT structure' };
      }

      const header = JSON.parse(atob(parts[0] || ''));
      const payload = JSON.parse(atob(parts[1] || ''));

      // Validate header
      if (!header.alg || !header.typ) {
        return { isValid: false, type: 'invalid', reason: 'Invalid token header' };
      }

      if (header.typ !== 'JWT') {
        return { isValid: false, type: 'invalid', reason: 'Invalid token type' };
      }

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return { isValid: false, type: 'invalid', reason: 'Token expired' };
      }

      // Determine token type based on payload
      // Supabase access tokens typically have 'aud' field
      const tokenType = payload.aud ? 'access' : 'refresh';

      return { isValid: true, type: tokenType };
    } catch (_error) {
      return { isValid: false, type: 'invalid', reason: 'Token parsing failed' };
    }
  }

  /**
   * Checks if a token is blacklisted
   */
  public isTokenBlacklisted(_token: string): boolean {
    // Synchronous path is not possible with Redis; keep a conservative default
    throw new Error('Use isTokenBlacklistedAsync instead');
  }

  public isTokenBlacklistedAsync(token: string): Promise<boolean> {
    try {
      return Promise.resolve(blacklistSet.has(token));
    } catch {
      return Promise.resolve(false);
    }
  }

  /**
   * Blacklists a token
   */
  public blacklistToken(token: string, reason: string = 'User logout'): void {
    // Best effort async writes
    blacklistSet.add(token);
    blacklistMeta.set(token, { reason, timestamp: Date.now() });
    console.warn(`🚫 Token blacklisted: ${token.substring(0, 20)}... (${reason})`);
  }

  /**
   * Checks if an account is marked as compromised
   */
  public isAccountCompromised(_userId: string): boolean {
    throw new Error('Use isAccountCompromisedAsync instead');
  }

  public isAccountCompromisedAsync(userId: string): Promise<boolean> {
    try {
      return Promise.resolve(compromisedSet.has(userId));
    } catch {
      return Promise.resolve(false);
    }
  }

  /**
   * Marks an account as compromised
   */
  public markAccountAsCompromised(userId: string, reason: string, markedBy: string): void {
    compromisedSet.add(userId);
    compromisedMeta.set(userId, { userId, reason, markedAt: new Date().toISOString(), markedBy });
    console.warn(`🚨 Account marked as compromised: ${userId} (${reason})`);
  }

  /**
   * Recovers a compromised account
   */
  public recoverAccount(userId: string): boolean {
    compromisedSet.delete(userId);
    compromisedMeta.delete(userId);
    return true;
  }

  /**
   * Clears grace period cache for a user (used when account deletion is canceled)
   */
  public clearGracePeriodCache(userId: string): void {
    if (this.gracePeriodCache) {
      this.gracePeriodCache.delete(`grace_period_${userId}`);
    }
  }

  /**
   * Gets compromised account information
   */
  public getCompromisedAccountInfo(_userId: string): CompromisedAccount | undefined {
    throw new Error('Use getCompromisedAccountInfoAsync instead');
  }

  public getCompromisedAccountInfoAsync(userId: string): Promise<CompromisedAccount | undefined> {
    try {
      const raw = compromisedMeta.get(userId);
      if (!raw) return Promise.resolve(undefined);
      return Promise.resolve({ ...raw, markedAt: new Date(raw.markedAt) } as CompromisedAccount);
    } catch {
      return Promise.resolve(undefined);
    }
  }

  /**
   * Validates token with Supabase and additional security checks
   */
  public async validateToken(token: string): Promise<{ 
    isValid: boolean; 
    user?: { id: string; email?: string }; 
    error?: string; 
    code?: string;
  }> {
    try {
      // First, check if token is blacklisted
      if (await this.isTokenBlacklistedAsync(token)) {
        return {
          isValid: false,
          error: 'Token revocado',
          code: 'AUTH_TOKEN_BLACKLISTED'
        };
      }

      // Validate token structure
      const structureValidation = this.validateTokenStructure(token);
      if (!structureValidation.isValid) {
        return {
          isValid: false,
          error: 'Token inválido',
          code: 'AUTH_TOKEN_INVALID_STRUCTURE'
        };
      }

      // Verify with Supabase
      const { data: { user }, error: authError } = await this.getSupabase().auth.getUser(token);
      
      if (authError || !user) {
        return {
          isValid: false,
          error: 'Token inválido o expirado',
          code: 'AUTH_TOKEN_INVALID'
        };
      }

      // Check if account is compromised
      if (await this.isAccountCompromisedAsync(user.id)) {
        return {
          isValid: false,
          error: 'Cuenta suspendida por seguridad',
          code: 'ACCOUNT_COMPROMISED'
        };
      }

      // 🔒 ENHANCED: Check if account is deleted with grace period support
      const isAccountDeleted = user?.user_metadata?.['account_deleted'] === true ||
                               (user as { raw_user_meta_data?: { account_deleted?: boolean } })?.raw_user_meta_data?.['account_deleted'] === true;

      if (isAccountDeleted) {
        // Get deletion info from metadata
        const deletedAt = user?.user_metadata?.['deleted_at'] ||
                         (user as { raw_user_meta_data?: { deleted_at?: string } })?.raw_user_meta_data?.['deleted_at'];
        const deletionLogId = user?.user_metadata?.['deletion_log_id'] ||
                             (user as { raw_user_meta_data?: { deletion_log_id?: string } })?.raw_user_meta_data?.['deletion_log_id'];

        // 🔥 FIX: Add cache and circuit breaker to prevent database query loops
        const gracePeriodCacheKey = `grace_period_${user.id}`;

        // Check if still in grace period by querying deletion log (with circuit breaker)
        if (deletionLogId) {
          try {
            // 🔥 FIX: Add a simple in-memory cache to prevent repeated DB queries
            const now = new Date();
            const cacheExpiry = 60000; // 1 minute cache

            if (!this.gracePeriodCache) {
              this.gracePeriodCache = new Map();
            }

            const cached = this.gracePeriodCache.get(gracePeriodCacheKey);
            if (cached && (now.getTime() - cached.timestamp) < cacheExpiry) {
              if (cached.isInGracePeriod) {
                return {
                  isValid: false,
                  error: `Cuenta marcada para eliminación. Puedes recuperarla en los próximos ${cached.daysRemaining} días.`,
                  code: 'ACCOUNT_PENDING_DELETION',
                  metadata: {
                    gracePeriodEnd: cached.gracePeriodEnd,
                    daysRemaining: cached.daysRemaining,
                    canRecover: true,
                    deletionLogId
                  }
                };
              } else {
                return {
                  isValid: false,
                  error: 'Cuenta eliminada permanentemente. Crea una nueva cuenta para continuar.',
                  code: 'ACCOUNT_DELETED_PERMANENTLY',
                  metadata: {
                    canRecover: false,
                    deletedAt
                  }
                };
              }
            }

            // Only query database if not cached
            const supabase = this.getSupabase();
            const { data: deletionLog, error } = await supabase
              .from('account_deletion_logs')
              .select('grace_period_end, status')
              .eq('id', deletionLogId)
              .single();

            if (!error && deletionLog) {
              const gracePeriodEnd = new Date(deletionLog.grace_period_end);

              if (deletionLog.status === 'pending' && now < gracePeriodEnd) {
                // Still in grace period - account can be recovered
                const daysRemaining = Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                // Cache the result
                this.gracePeriodCache.set(gracePeriodCacheKey, {
                  isInGracePeriod: true,
                  gracePeriodEnd: gracePeriodEnd.toISOString(),
                  daysRemaining,
                  timestamp: now.getTime()
                });

                return {
                  isValid: false,
                  error: `Cuenta marcada para eliminación. Puedes recuperarla en los próximos ${daysRemaining} días.`,
                  code: 'ACCOUNT_PENDING_DELETION',
                  metadata: {
                    gracePeriodEnd: gracePeriodEnd.toISOString(),
                    daysRemaining,
                    canRecover: true,
                    deletionLogId
                  }
                };
              } else {
                // Cache the expired result
                this.gracePeriodCache.set(gracePeriodCacheKey, {
                  isInGracePeriod: false,
                  timestamp: now.getTime()
                });
              }
            }
          } catch (dbError) {
            console.warn('Could not check grace period (cached as expired):', dbError);
            // Cache as expired to prevent repeated failed queries
            this.gracePeriodCache?.set(gracePeriodCacheKey, {
              isInGracePeriod: false,
              timestamp: new Date().getTime()
            });
          }
        }

        // Grace period expired or other deletion status
        return {
          isValid: false,
          error: 'Cuenta eliminada permanentemente. Crea una nueva cuenta para continuar.',
          code: 'ACCOUNT_DELETED_PERMANENTLY',
          metadata: {
            canRecover: false,
            deletedAt
          }
        };
      }

      return {
        isValid: true,
        user
      };

    } catch (_error) {
      return {
        isValid: false,
        error: 'Error interno de validación',
        code: 'AUTH_INTERNAL_ERROR'
      };
    }
  }

  /**
   * Gets all active sessions for a user (for force logout)
   */
  public async getUserSessions(userId: string): Promise<{ token: string }[]> {
    try {
      const { data: { users }, error } = await this.getSupabase().auth.admin.listUsers();
      
      if (error) {
        throw new Error('Failed to retrieve user sessions');
      }

      const user = users.find(u => u.id === userId);
      if (!user) {
        return [];
      }

      // In a production environment, you would:
      // 1. Query your session store for all active sessions
      // 2. Return session information including tokens
      // 3. Optionally include device information

      return []; // Placeholder - implement based on your session storage
    } catch (error) {
      console.error('Error getting user sessions:', error);
      return [];
    }
  }

  /**
   * Force logout all sessions for a user
   */
  public async forceLogoutUser(userId: string, reason: string, markedBy: string): Promise<boolean> {
    try {
      // Mark account as compromised
      this.markAccountAsCompromised(userId, reason, markedBy);

      // Get all sessions and blacklist them
      const sessions = await this.getUserSessions(userId);
      
      sessions.forEach(session => {
        if (session.token) {
          this.blacklistToken(session.token, `Force logout: ${reason}`);
        }
      });

      return true;
    } catch (error) {
      console.error('Error during force logout:', error);
      return false;
    }
  }

  /**
   * Get statistics for monitoring
   */
  public getStats(): {
    blacklistedTokens: number;
    compromisedAccounts: number;
  } {
    // Return best-effort counts (in-memory returns 0 if unavailable)
    return {
      blacklistedTokens: 0,
      compromisedAccounts: 0
    };
  }

  /**
   * Get statistics for monitoring (async, accurate via Redis)
   */
  public async getStatsAsync(): Promise<{
    blacklistedTokens: number;
    compromisedAccounts: number;
  }> {
    try {
      const [bl, ca] = await Promise.all([
        blacklistSet.size,
        compromisedSet.size
      ]);
      return { blacklistedTokens: bl, compromisedAccounts: ca };
    } catch {
      return { blacklistedTokens: 0, compromisedAccounts: 0 };
    }
  }
}

// Export singleton instance
export const tokenService = TokenManagementService.getInstance(); 