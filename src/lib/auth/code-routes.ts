import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** Shared pieces for the /api/auth/verify-email and /api/auth/password-reset routes. */

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");
export const codeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email.");

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Per-IP and per-email limits, so codes can't be sprayed at inboxes or guessed
 * at speed. Returns a 429 response when over the limit, otherwise null.
 */
export function limitCodeRequests(req: Request, action: string, email: string, { perIp, perEmail }: { perIp: number; perEmail: number }) {
  const windowMs = 15 * 60_000;
  const byIp = rateLimit(`${action}:ip:${clientIp(req)}`, perIp, windowMs);
  const byEmail = rateLimit(`${action}:email:${email}`, perEmail, windowMs);
  if (byIp.ok && byEmail.ok) return null;
  const wait = Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds);
  return NextResponse.json(
    { error: `Too many attempts. Please wait ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""} and try again.` },
    { status: 429, headers: { "Retry-After": String(wait) } },
  );
}
