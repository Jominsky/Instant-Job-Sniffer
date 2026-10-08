// In-memory sliding-window rate limiter (pure). Per-process: right for a single-instance personal deployment;
// swap the Map for Redis (INCR + EXPIRE) if you run several web replicas.
export type LimitResult = { ok: boolean; remaining: number; retryAfterSec: number };
export type Limiter = { check(key: string, now?: number): LimitResult; reset(key: string): void };

export function createLimiter(limit: number, windowMs: number): Limiter {
  const hits = new Map<string, number[]>();
  return {
    check(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);   // bound memory
      return { ok: true, remaining: limit - recent.length, retryAfterSec: 0 };
    },
    reset(key) { hits.delete(key); },
  };
}
