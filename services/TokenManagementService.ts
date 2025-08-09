import { getSupabaseClient } from '../utils/supabase.ts';
import { RedisService } from './RedisService.ts';

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

// Redis-backed stores
const redis = RedisService.getInstance();
const BLACKLIST_SET = 'auth:blacklist';
const BLACKLIST_META_PREFIX = 'auth:blacklist:meta'; // key per token -> JSON with reason + ts, TTL
const COMPROMISED_SET = 'auth:compromised';
const COMPROMISED_META_PREFIX = 'auth:compromised:meta'; // key per user -> JSON
const BLACKLIST_TTL_SECONDS = 24 * 60 * 60; // 24h cleanup window

export class TokenManagementService {
  private static instance: TokenManagementService;
  private supabase: ReturnType<typeof getSupabaseClient> | null = null;

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

      const header = JSON.parse(atob(parts[0]));
      const payload = JSON.parse(atob(parts[1]));

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

  public async isTokenBlacklistedAsync(token: string): Promise<boolean> {
    try {
      return await redis.sismember(BLACKLIST_SET, token);
    } catch {
      return false;
    }
  }

  /**
   * Blacklists a token
   */
  public blacklistToken(token: string, reason: string = 'User logout'): void {
    const metaKey = `${BLACKLIST_META_PREFIX}:${token}`;
    const meta = JSON.stringify({ reason, blacklistedAt: new Date().toISOString() });
    // Best effort async writes
    redis.sadd(BLACKLIST_SET, token).catch(() => {});
    redis.setex(metaKey, BLACKLIST_TTL_SECONDS, meta).catch(() => {});
    console.warn(`🚫 Token blacklisted: ${token.substring(0, 20)}... (${reason})`);
  }

  /**
   * Checks if an account is marked as compromised
   */
  public isAccountCompromised(_userId: string): boolean {
    throw new Error('Use isAccountCompromisedAsync instead');
  }

  public async isAccountCompromisedAsync(userId: string): Promise<boolean> {
    try {
      return await redis.sismember(COMPROMISED_SET, userId);
    } catch {
      return false;
    }
  }

  /**
   * Marks an account as compromised
   */
  public markAccountAsCompromised(userId: string, reason: string, markedBy: string): void {
    const metaKey = `${COMPROMISED_META_PREFIX}:${userId}`;
    const meta = JSON.stringify({ userId, reason, markedAt: new Date().toISOString(), markedBy });
    redis.sadd(COMPROMISED_SET, userId).catch(() => {});
    redis.set(metaKey, meta).catch(() => {});
    console.warn(`🚨 Account marked as compromised: ${userId} (${reason})`);
  }

  /**
   * Recovers a compromised account
   */
  public recoverAccount(userId: string): boolean {
    const metaKey = `${COMPROMISED_META_PREFIX}:${userId}`;
    redis.srem(COMPROMISED_SET, userId).catch(() => {});
    redis.del(metaKey).catch(() => {});
    return true;
  }

  /**
   * Gets compromised account information
   */
  public getCompromisedAccountInfo(_userId: string): CompromisedAccount | undefined {
    throw new Error('Use getCompromisedAccountInfoAsync instead');
  }

  public async getCompromisedAccountInfoAsync(userId: string): Promise<CompromisedAccount | undefined> {
    try {
      const metaKey = `${COMPROMISED_META_PREFIX}:${userId}`;
      const raw = await redis.get(metaKey);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      return { ...parsed, markedAt: new Date(parsed.markedAt) } as CompromisedAccount;
    } catch {
      return undefined;
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
        redis.scard(BLACKLIST_SET),
        redis.scard(COMPROMISED_SET)
      ]);
      return { blacklistedTokens: bl, compromisedAccounts: ca };
    } catch {
      return { blacklistedTokens: 0, compromisedAccounts: 0 };
    }
  }
}

// Export singleton instance
export const tokenService = TokenManagementService.getInstance(); 