import { RedisService } from "./RedisService.ts";
import { SecureLogger } from "../utils/secureLogger.ts";
import { createHash } from "node:crypto";

export class EnhancedTokenService {
  private redis = RedisService.getInstance();
  private logger = SecureLogger.getInstance();
  
  private readonly BLACKLIST_PREFIX = "blacklist_token:";
  private readonly CSRF_PREFIX = "csrf_token:";
  private readonly USER_SESSION_PREFIX = "user_session:";
  
  async blacklistToken(token: string, reason: string = "logout"): Promise<void> {
    try {
      // Extraer la expiración del token JWT
      const payload = this.decodeJWT(token);
      const expiresAt = payload?.exp ? payload.exp * 1000 : Date.now() + (24 * 60 * 60 * 1000);
      const ttl = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      
      if (ttl > 0) {
        await this.redis.set(`${this.BLACKLIST_PREFIX}${token}`, reason, ttl);
        
        this.logger.logSecurityEvent({
          level: 'info',
          message: 'Token blacklisted',
          data: { reason, tokenHash: this.hashToken(token) }
        });
      }
    } catch (error) {
      this.logger.logSecurityEvent({
        level: 'error',
        message: 'Failed to blacklist token',
        data: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      throw error;
    }
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      return await this.redis.exists(`${this.BLACKLIST_PREFIX}${token}`);
    } catch (error) {
      this.logger.logSecurityEvent({
        level: 'error',
        message: 'Failed to check blacklist',
        data: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      // En caso de error, asumir que NO está en blacklist (fail open)
      return false;
    }
  }

  async storeCSRFToken(sessionId: string, token: string): Promise<void> {
    try {
      const expireSeconds = 30 * 60; // 30 minutos
      await this.redis.setex(`${this.CSRF_PREFIX}${sessionId}`, expireSeconds, token);
    } catch (error) {
      this.logger.logSecurityEvent({
        level: 'error',
        message: 'Failed to store CSRF token',
        data: { error: error instanceof Error ? error.message : 'Unknown error', sessionId: this.hashString(sessionId) }
      });
      throw error;
    }
  }

  async validateCSRFToken(sessionId: string, token: string): Promise<boolean> {
    try {
      const storedToken = await this.redis.get(`${this.CSRF_PREFIX}${sessionId}`);
      return storedToken === token;
    } catch (error) {
      this.logger.logSecurityEvent({
        level: 'error',
        message: 'Failed to validate CSRF token',
        data: { error: error instanceof Error ? error.message : 'Unknown error', sessionId: this.hashString(sessionId) }
      });
      return false;
    }
  }

  async trackUserSession(userId: string, sessionData: unknown): Promise<void> {
    try {
      const sessionInfo = {
        ...(typeof sessionData === 'object' && sessionData !== null ? sessionData : {}),
        lastActivity: new Date().toISOString(),
        createdAt: (typeof sessionData === 'object' && sessionData !== null && 'createdAt' in sessionData) ? (sessionData as Record<string, unknown>).createdAt : new Date().toISOString()
      };
      
      await this.redis.set(
        `${this.USER_SESSION_PREFIX}${userId}`,
        JSON.stringify(sessionInfo)
      );
    } catch (error) {
      this.logger.logSecurityEvent({
        level: 'error',
        message: 'Failed to track user session',
        data: { error: error instanceof Error ? error.message : 'Unknown error', userId }
      });
    }
  }

  async getUserSession(userId: string): Promise<unknown | null> {
    try {
      const sessionData = await this.redis.get(`${this.USER_SESSION_PREFIX}${userId}`);
      return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
      this.logger.logSecurityEvent({
        level: 'error',
        message: 'Failed to get user session',
        data: { error: error instanceof Error ? error.message : 'Unknown error', userId }
      });
      return null;
    }
  }

  async updateUserSessionActivity(userId: string): Promise<void> {
    try {
      const session = await this.getUserSession(userId);
      if (session && typeof session === 'object' && session !== null) {
        (session as Record<string, unknown>).lastActivity = new Date().toISOString();
        await this.trackUserSession(userId, session);
      }
    } catch (error) {
      this.logger.logSecurityEvent({
        level: 'error',
        message: 'Failed to update user session activity',
        data: { error: error instanceof Error ? error.message : 'Unknown error', userId }
      });
    }
  }

  async removeUserSession(userId: string): Promise<void> {
    try {
      await this.redis.del(`${this.USER_SESSION_PREFIX}${userId}`);
    } catch (error) {
      this.logger.logSecurityEvent({
        level: 'error',
        message: 'Failed to remove user session',
        data: { error: error instanceof Error ? error.message : 'Unknown error', userId }
      });
    }
  }

  private decodeJWT(token: string): unknown {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const payload = parts[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex').substring(0, 16);
  }

  private hashString(str: string): string {
    return createHash('sha256').update(str).digest('hex').substring(0, 8);
  }
} 