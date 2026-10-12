import crypto from "node:crypto";
import { z } from "zod";

/*
 * Pure rules for the store team: invite tokens and codes, invite states, and
 * who may change whom. Database work is in team.ts.
 */

export const INVITE_TTL_DAYS = 7;
export const INVITE_CODE_TTL_MINUTES = 10;
/** Minimum gap between two codes for the same invite. */
export const INVITE_CODE_COOLDOWN_SECONDS = 60;
export const INVITABLE_ROLES = ["admin", "staff"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const ROLE_DESCRIPTIONS: Record<"owner" | InvitableRole, string> = {
  owner: "Everything, including the plan, payouts and the team. There is one owner.",
  admin: "Everything the owner can do, except change or remove the owner.",
  staff: "Orders, products, collections and customers. No payments, settings or team.",
};

export const inviteSchema = z.object({
  name: z.string().trim().min(1, "Enter their name.").max(100, "Keep the name to 100 characters."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "That email address is too long.")
    .pipe(z.email("Enter a valid email address.")),
  role: z.enum(INVITABLE_ROLES, "Choose Admin or Staff."),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters for your password.")
  .max(72, "Keep your password to 72 characters.");

/** A random token for the invite link (256 bits). Only its hash is stored. */
export function generateInviteToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(`store-invite-token:${token}`).digest("hex");
}

/** Tokens are base64url of 32 bytes; anything else is rejected before touching the database. */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function generateInviteCode() {
  return String(crypto.randomInt(100000, 1000000));
}

/** Salted with the invite, so a code hash means nothing outside its own invite. */
export function hashInviteCode(inviteId: string, code: string) {
  return crypto.createHash("sha256").update(`store-invite-code:${inviteId}:${code.trim()}`).digest("hex");
}

export type InviteRow = {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: InvitableRole;
  expires_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
  code_hash?: string | null;
  code_expires_at?: string | null;
  code_attempts?: number;
  code_sent_at?: string | null;
  created_at?: string;
};

export type InviteState = "open" | "expired" | "accepted" | "cancelled";

export function inviteState(invite: Pick<InviteRow, "expires_at" | "accepted_at" | "cancelled_at">, now = Date.now()): InviteState {
  if (invite.accepted_at) return "accepted";
  if (invite.cancelled_at) return "cancelled";
  return new Date(invite.expires_at).getTime() <= now ? "expired" : "open";
}

/** Seconds until another code may be sent, or 0. */
export function codeCooldownLeft(codeSentAt: string | null | undefined, now = Date.now()) {
  if (!codeSentAt) return 0;
  const left = INVITE_CODE_COOLDOWN_SECONDS * 1000 - (now - new Date(codeSentAt).getTime());
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

export type MemberChange = {
  actorRole: string | null;
  actorUserId: string;
  targetRole: string;
  targetUserId: string;
  /** null removes the member. */
  newRole: string | null;
};

/**
 * Who may change whom. Returns a message for the person making the change,
 * or null when it's allowed. "Not the last owner" is checked again in the
 * database (store.change_store_member), where it can't race.
 */
export function memberChangeError(change: MemberChange): string | null {
  const { actorRole, targetRole, newRole } = change;
  if (actorRole !== "owner" && actorRole !== "admin") return "Only the owner or an admin can change the team.";
  if (newRole !== null && !(INVITABLE_ROLES as readonly string[]).includes(newRole)) return "Choose Admin or Staff.";
  if (targetRole === "owner" && actorRole !== "owner") {
    return newRole === null ? "Only the owner can remove the owner." : "Only the owner can change the owner's role.";
  }
  if (newRole !== null && newRole === targetRole) return "They already have that role.";
  return null;
}

export const CHANGE_RESULT_MESSAGES: Record<string, string> = {
  not_found: "That person isn't on the team any more.",
  invalid: "Choose Admin or Staff.",
  last_owner: "Every shop needs an owner, so the only owner can't be removed or given another role.",
};
