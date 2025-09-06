import { kv } from '@vercel/kv';

interface VercelKVConfig {
  // Vercel KV doesn't need connection config - it uses environment variables
}

export class VercelKVService {
  private static instance: VercelKVService;
  private isConnected = true; // Vercel KV is always "connected"
  
  public static getInstance(): VercelKVService {
    if (!VercelKVService.instance) {
      VercelKVService.instance = new VercelKVService();
    }
    return VercelKVService.instance;
  }

  connect(_config: VercelKVConfig): void {
    // Vercel KV doesn't need explicit connection
    console.log("✅ Vercel KV connected (no explicit connection needed)");
    this.isConnected = true;
  }

  async set(key: string, value: string, expireSeconds?: number): Promise<void> {
    if (!this.isConnected) throw new Error("Vercel KV not connected");
    
    try {
      if (expireSeconds) {
        await kv.setex(key, expireSeconds, value);
      } else {
        await kv.set(key, value);
      }
    } catch (error) {
      console.error("❌ Vercel KV set error:", error);
      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isConnected) throw new Error("Vercel KV not connected");
    
    try {
      const result = await kv.get(key);
      return result as string | null;
    } catch (error) {
      console.error("❌ Vercel KV get error:", error);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected) throw new Error("Vercel KV not connected");
    
    try {
      await kv.del(key);
    } catch (error) {
      console.error("❌ Vercel KV del error:", error);
      throw error;
    }
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    if (!this.isConnected) throw new Error("Vercel KV not connected");
    
    try {
      await kv.setex(key, seconds, value);
    } catch (error) {
      console.error("❌ Vercel KV setex error:", error);
      throw error;
    }
  }

  async ping(): Promise<string> {
    if (!this.isConnected) throw new Error("Vercel KV not connected");
    
    try {
      // Vercel KV doesn't have a ping command, so we'll do a simple get
      await kv.get("ping-test");
      return "PONG";
    } catch (error) {
      console.error("❌ Vercel KV ping error:", error);
      throw error;
    }
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.isConnected) throw new Error("Vercel KV not connected");
    
    try {
      return await kv.sadd(key, ...members);
    } catch (error) {
      console.error("❌ Vercel KV sadd error:", error);
      throw error;
    }
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    if (!this.isConnected) throw new Error("Vercel KV not connected");
    
    try {
      return await kv.srem(key, ...members);
    } catch (error) {
      console.error("❌ Vercel KV srem error:", error);
      throw error;
    }
  }

  async smembers(key: string): Promise<string[]> {
    if (!this.isConnected) throw new Error("Vercel KV not connected");
    
    try {
      return await kv.smembers(key) as string[];
    } catch (error) {
      console.error("❌ Vercel KV smembers error:", error);
      return [];
    }
  }

  async scard(key: string): Promise<number> {
    if (!this.isConnected) throw new Error("Vercel KV not connected");
    
    try {
      return await kv.scard(key);
    } catch (error) {
      console.error("❌ Vercel KV scard error:", error);
      return 0;
    }
  }

  async sismember(key: string, member: string): Promise<boolean> {
    if (!this.isConnected) throw new Error("Vercel KV not connected");
    
    try {
      return await kv.sismember(key, member);
    } catch (error) {
      console.error("❌ Vercel KV sismember error:", error);
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    if (!this.isConnected) throw new Error("Vercel KV not connected");
    
    try {
      return await kv.incr(key);
    } catch (error) {
      console.error("❌ Vercel KV incr error:", error);
      return 0;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.isConnected) throw new Error("Vercel KV not connected");
    
    try {
      return await kv.expire(key, seconds);
    } catch (error) {
      console.error("❌ Vercel KV expire error:", error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    if (!this.isConnected) throw new Error("Vercel KV not connected");
    
    try {
      return await kv.ttl(key);
    } catch (error) {
      console.error("❌ Vercel KV ttl error:", error);
      return -1;
    }
  }
}
