interface RedisConfig {
  hostname: string;
  port: number;
  password?: string;
  db?: number;
}

export class RedisService {
  private static instance: RedisService;
  private redis: unknown = null; // Redis client
  private isConnected = false;
  
  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  connect(_config: RedisConfig): void {
    if (this.isConnected) return;
    
    try {
      // En desarrollo, usar memory storage
      if (Deno.env.get("ENVIRONMENT") === "development") {
        this.redis = new InMemoryRedis();
        this.isConnected = true;
        return;
      }

      // TODO: Implementar conexión real a Redis cuando esté disponible
      // Por ahora, usar in-memory storage
      console.log("⚠️ Redis real no implementado, usando almacenamiento en memoria");
      this.redis = new InMemoryRedis();
      this.isConnected = true;
      console.log("✅ Redis connected successfully");
    } catch (error) {
      console.error("❌ Redis connection failed:", error);
      // Fallback a memoria en caso de error
      this.redis = new InMemoryRedis();
      this.isConnected = true;
    }
  }

  async set(key: string, value: string, expireSeconds?: number): Promise<void> {
    if (!this.isConnected) throw new Error("Redis not connected");
    
    if (expireSeconds) {
      await (this.redis as InMemoryRedis).setex(key, expireSeconds, value);
    } else {
      await (this.redis as InMemoryRedis).set(key, value);
    }
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    if (!this.isConnected) throw new Error("Redis not connected");
    await (this.redis as InMemoryRedis).setex(key, seconds, value);
  }

  async get(key: string): Promise<string | null> {
    if (!this.isConnected) throw new Error("Redis not connected");
    return await (this.redis as InMemoryRedis).get(key);
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected) throw new Error("Redis not connected");
    await (this.redis as InMemoryRedis).del(key);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isConnected) throw new Error("Redis not connected");
    const result = await (this.redis as InMemoryRedis).exists(key);
    return result === 1;
  }

  async sadd(key: string, value: string): Promise<void> {
    if (!this.isConnected) throw new Error("Redis not connected");
    await (this.redis as InMemoryRedis).sadd(key, value);
  }

  async sismember(key: string, value: string): Promise<boolean> {
    if (!this.isConnected) throw new Error("Redis not connected");
    const result = await (this.redis as InMemoryRedis).sismember(key, value);
    return result === 1;
  }

  async srem(key: string, value: string): Promise<void> {
    if (!this.isConnected) throw new Error("Redis not connected");
    await (this.redis as InMemoryRedis).srem(key, value);
  }

  // NEW: Increment a numeric key atomically
  async incr(key: string): Promise<number> {
    if (!this.isConnected) throw new Error("Redis not connected");
    return await (this.redis as InMemoryRedis).incr(key);
  }

  // NEW: Set TTL on a key
  async expire(key: string, seconds: number): Promise<void> {
    if (!this.isConnected) throw new Error("Redis not connected");
    await (this.redis as InMemoryRedis).expire(key, seconds);
  }

  // NEW: Get remaining TTL (in seconds) for a key, or -1 if none
  async ttl(key: string): Promise<number> {
    if (!this.isConnected) throw new Error("Redis not connected");
    return await (this.redis as InMemoryRedis).ttl(key);
  }

  // NEW: Get set cardinality
  async scard(key: string): Promise<number> {
    if (!this.isConnected) throw new Error("Redis not connected");
    return await (this.redis as InMemoryRedis).scard(key);
  }
}

// Implementación en memoria para desarrollo
class InMemoryRedis {
  private storage = new Map<string, { value: string; expires?: number }>();
  private sets = new Map<string, Set<string>>();

  ping(): string {
    return "PONG";
  }

  set(key: string, value: string): void {
    this.storage.set(key, { value });
  }

  setex(key: string, seconds: number, value: string): void {
    const expires = Date.now() + (seconds * 1000);
    this.storage.set(key, { value, expires });
  }

  get(key: string): string | null {
    const item = this.storage.get(key);
    if (!item) return null;
    
    if (item.expires && Date.now() > item.expires) {
      this.storage.delete(key);
      return null;
    }
    
    return item.value;
  }

  del(key: string): void {
    this.storage.delete(key);
    this.sets.delete(key);
  }

  exists(key: string): number {
    const exists = this.storage.has(key) || this.sets.has(key);
    return exists ? 1 : 0;
  }

  sadd(key: string, value: string): void {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    this.sets.get(key)!.add(value);
  }

  sismember(key: string, value: string): number {
    const set = this.sets.get(key);
    return set && set.has(value) ? 1 : 0;
  }

  srem(key: string, value: string): void {
    const set = this.sets.get(key);
    if (set) {
      set.delete(value);
    }
  }

  // NEW: Atomic increment for counters
  incr(key: string): number {
    const item = this.storage.get(key);
    if (!item) {
      const value = 1;
      this.storage.set(key, { value: String(value) });
      return value;
    }
    // Respect expiration
    if (item.expires && Date.now() > item.expires) {
      const value = 1;
      this.storage.set(key, { value: String(value) });
      return value;
    }
    const current = parseInt(item.value, 10) || 0;
    const next = current + 1;
    this.storage.set(key, { value: String(next), expires: item.expires });
    return next;
  }

  // NEW: Set expiration on an existing key
  expire(key: string, seconds: number): void {
    const item = this.storage.get(key);
    const expires = Date.now() + (seconds * 1000);
    if (item) {
      this.storage.set(key, { value: item.value, expires });
    } else {
      // Create empty placeholder with expiration if not exists
      this.storage.set(key, { value: "", expires });
    }
  }

  // NEW: Get TTL in seconds; -2 if key does not exist; -1 if no expiration
  ttl(key: string): number {
    const item = this.storage.get(key);
    if (!item) return -2;
    if (!item.expires) return -1;
    const ms = item.expires - Date.now();
    return ms > 0 ? Math.ceil(ms / 1000) : -2;
  }

  // NEW: Set cardinality
  scard(key: string): number {
    const set = this.sets.get(key);
    return set ? set.size : 0;
  }
} 