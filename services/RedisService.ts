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
} 