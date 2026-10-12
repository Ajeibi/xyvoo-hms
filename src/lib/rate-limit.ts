import { createHash } from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Minimal fixed-window rate limiter, in memory.
 *
 * Good enough to blunt casual abuse of public forms on a single server. It resets on
 * restart and isn't shared between instances, so a multi-instance deployment should
 * swap this for a shared store (for example Redis or a Supabase table).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return { ok: true, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * Rate limit shared by every server (public.rate_limit_hit), for public
 * endpoints where abuse costs money or sends messages. The in-memory check runs
 * first, so repeat offenders on this server never reach the database. If the
 * database can't be reached, the in-memory result stands, so shoppers are
 * never locked out by an outage.
 */
export async function rateLimitShared(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  const local = rateLimit(key, limit, windowMs);
  if (!local.ok) return local;
  try {
    const keyHash = createHash("sha256").update(key).digest("hex");
    const windowSeconds = Math.max(1, Math.round(windowMs / 1000));
    const { data, error } = await createServerSupabaseClient().rpc("rate_limit_hit", { p_key_hash: keyHash, p_limit: limit, p_window_seconds: windowSeconds });
    if (error) throw new Error(error.message);
    if (data === false) {
      const now = Date.now();
      return { ok: false, retryAfterSeconds: Math.ceil((windowSeconds * 1000 - (now % (windowSeconds * 1000))) / 1000) };
    }
  } catch (error) {
    console.error("[rate limit] shared check unavailable, using this server's count", error);
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/** Best-effort client IP from standard proxy headers. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
