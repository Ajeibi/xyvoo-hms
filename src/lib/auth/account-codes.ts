import crypto from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/*
 * Six-digit codes emailed to account holders (public.account_codes): confirming
 * a new store owner's email, and resetting a forgotten password.
 */

export type AccountCodePurpose = "verify_email" | "reset_password";

export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;
/** Minimum gap between two codes for the same account and purpose. */
export const RESEND_COOLDOWN_SECONDS = 60;

export function generateAccountCode() {
  return String(crypto.randomInt(100000, 1000000));
}

/** Salted with the user and purpose, so a code hash can't be reused or looked up across accounts. */
export function hashAccountCode(userId: string, purpose: AccountCodePurpose, code: string) {
  return crypto.createHash("sha256").update(`${userId}:${purpose}:${code}`).digest("hex");
}

export type StoredCode = { code_hash: string; expires_at: string; attempts: number; consumed_at: string | null };

export type CodeCheck = "ok" | "missing" | "expired" | "too_many_attempts" | "wrong";

/** Pure check of a submitted code against the latest stored one. */
export function checkCode(stored: StoredCode | null, submittedHash: string, now = Date.now()): CodeCheck {
  if (!stored || stored.consumed_at) return "missing";
  if (stored.attempts >= MAX_CODE_ATTEMPTS) return "too_many_attempts";
  if (new Date(stored.expires_at).getTime() < now) return "expired";
  const a = Buffer.from(stored.code_hash, "hex");
  const b = Buffer.from(submittedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? "ok" : "wrong";
}

export const CODE_CHECK_MESSAGES: Record<Exclude<CodeCheck, "ok">, string> = {
  missing: "That code isn't valid any more. Ask for a new one.",
  expired: "That code has expired. Ask for a new one.",
  too_many_attempts: "Too many attempts with that code. Ask for a new one.",
  wrong: "That code isn't right. Check the email and try again.",
};

export type AuthUserLookup = { id: string; email: string; emailConfirmedAt: string | null; fullName: string | null };

export async function findAuthUserByEmail(email: string): Promise<AuthUserLookup | null> {
  const { data, error } = await createServerSupabaseClient().rpc("find_auth_user_by_email", { p_email: email });
  if (error) throw new Error(error.message);
  const row = (data as Array<{ id: string; email: string; email_confirmed_at: string | null; full_name: string | null }> | null)?.[0];
  return row ? { id: row.id, email: row.email, emailConfirmedAt: row.email_confirmed_at, fullName: row.full_name } : null;
}

/**
 * Creates a new code (cancelling any earlier unused one) and returns it, or
 * null if a code was sent less than RESEND_COOLDOWN_SECONDS ago.
 */
export async function issueAccountCode(userId: string, purpose: AccountCodePurpose): Promise<string | null> {
  const db = createServerSupabaseClient();
  const { data: latest } = await db
    .from("account_codes")
    .select("created_at")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest && Date.now() - new Date(latest.created_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000) return null;

  const now = new Date();
  await db.from("account_codes").update({ consumed_at: now.toISOString() }).eq("user_id", userId).eq("purpose", purpose).is("consumed_at", null);

  const code = generateAccountCode();
  const { error } = await db.from("account_codes").insert({
    user_id: userId,
    purpose,
    code_hash: hashAccountCode(userId, purpose, code),
    expires_at: new Date(now.getTime() + CODE_TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return code;
}

/** Checks a submitted code, counting the attempt, and marks it used when it matches. */
export async function redeemAccountCode(userId: string, purpose: AccountCodePurpose, code: string): Promise<CodeCheck> {
  const db = createServerSupabaseClient();
  const { data: stored } = await db
    .from("account_codes")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const result = checkCode(stored, hashAccountCode(userId, purpose, code.trim()));
  if (!stored || result === "missing" || result === "too_many_attempts") return result;

  await db
    .from("account_codes")
    .update(result === "ok" ? { attempts: stored.attempts + 1, consumed_at: new Date().toISOString() } : { attempts: stored.attempts + 1 })
    .eq("id", stored.id);
  return result;
}

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 2)}${"*".repeat(Math.max(local.length - 3, 1))}${local.slice(-1)}@${domain}`;
}
