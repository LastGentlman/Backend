import { getSupabaseClient } from '../utils/supabase.ts';

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

// In production, these should be stored in Redis or a database
const tokenBlacklist = new Map<string, { blacklistedAt: Date; reason: string }>();
const compromisedAccounts = new Map<string, CompromisedAccount>();

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
  public isTokenBlacklisted(token: string): boolean {
    return tokenBlacklist.has(token);
  }

  /**
   * Blacklists a token
   */
  public blacklistToken(token: string, reason: string = 'User logout'): void {
    tokenBlacklist.set(token, {
      blacklistedAt: new Date(),
      reason
    });

    // Clean up old blacklisted tokens (older than 24 hours)
    this.cleanupBlacklistedTokens();
    
    console.warn(`🚫 Token blacklisted: ${token.substring(0, 20)}... (${reason})`);
  }

  /**
   * Checks if an account is marked as compromised
   */
  public isAccountCompromised(userId: string): boolean {
    return compromisedAccounts.has(userId);
  }

  /**
   * Marks an account as compromised
   */
  public markAccountAsCompromised(userId: string, reason: string, markedBy: string): void {
    compromisedAccounts.set(userId, {
      userId,
      reason,
      markedAt: new Date(),
      markedBy
    });

    console.warn(`🚨 Account marked as compromised: ${userId} (${reason})`);
  }

  /**
   * Recovers a compromised account
   */
  public recoverAccount(userId: string): boolean {
    return compromisedAccounts.delete(userId);
  }

  /**
   * Gets compromised account information
   */
  public getCompromisedAccountInfo(userId: string): CompromisedAccount | undefined {
    return compromisedAccounts.get(userId);
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
      if (this.isTokenBlacklisted(token)) {
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
      if (this.isAccountCompromised(user.id)) {
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
   * Cleanup old blacklisted tokens (older than 24 hours)
   */
  private cleanupBlacklistedTokens(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    for (const [token, info] of tokenBlacklist.entries()) {
      if (info.blacklistedAt < cutoffTime) {
        tokenBlacklist.delete(token);
      }
    }
  }

  /**
   * Get statistics for monitoring
   */
  public getStats(): {
    blacklistedTokens: number;
    compromisedAccounts: number;
  } {
    return {
      blacklistedTokens: tokenBlacklist.size,
      compromisedAccounts: compromisedAccounts.size
    };
  }
}

// Export singleton instance
export const tokenService = TokenManagementService.getInstance(); 