import { badge, detailsPanel, EMAIL_SITE_URL, escapeHtml } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STORE_ROLE_LABELS } from "./access";
import {
  generateInviteCode,
  generateInviteToken,
  hashInviteCode,
  hashInviteToken,
  INVITE_CODE_TTL_MINUTES,
  INVITE_TTL_DAYS,
  ROLE_DESCRIPTIONS,
  type InvitableRole,
  type InviteRow,
} from "./team-rules";

/*
 * Store team: members, invitations and the emails that go with them. Every
 * query runs as the service role, so every one is filtered by tenant_id.
 * Who may do what is checked by the routes (see team-rules.ts).
 */

const db = () => createServerSupabaseClient().schema("store");

export type TeamMember = { userId: string; role: "owner" | "admin" | "staff"; name: string; email: string; joinedAt: string };

export async function listTeamMembers(tenantId: string): Promise<TeamMember[]> {
  const { data, error } = await db().rpc("list_store_members", { p_tenant_id: tenantId });
  if (error) throw new Error(error.message);
  return ((data as Array<{ user_id: string; role: TeamMember["role"]; joined_at: string; email: string | null; full_name: string | null }>) || []).map((m) => ({
    userId: m.user_id,
    role: m.role,
    name: m.full_name || m.email?.split("@")[0] || "Team member",
    email: m.email || "",
    joinedAt: m.joined_at,
  }));
}

const INVITE_COLUMNS = "id, tenant_id, email, name, role, expires_at, accepted_at, cancelled_at, code_hash, code_expires_at, code_attempts, code_sent_at, created_at";

/** Invitations not yet accepted or cancelled, newest first (expired ones included, so they can be resent). */
export async function listOpenInvites(tenantId: string): Promise<InviteRow[]> {
  const { data, error } = await db()
    .from("team_invites")
    .select(INVITE_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("accepted_at", null)
    .is("cancelled_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as InviteRow[]) || [];
}

export async function getInviteById(tenantId: string, inviteId: string): Promise<InviteRow | null> {
  const { data } = await db().from("team_invites").select(INVITE_COLUMNS).eq("tenant_id", tenantId).eq("id", inviteId).maybeSingle();
  return (data as InviteRow | null) ?? null;
}

export async function getInviteByToken(token: string): Promise<InviteRow | null> {
  const { data } = await db().from("team_invites").select(INVITE_COLUMNS).eq("token_hash", hashInviteToken(token)).maybeSingle();
  return (data as InviteRow | null) ?? null;
}

/**
 * Creates an invitation, or refreshes the open one for the same address (a
 * new link, a new expiry date, any earlier link stops working). Returns the
 * invite and the link token, which exists only in this response and the email.
 */
export async function createOrRefreshInvite(input: { tenantId: string; email: string; name: string; role: InvitableRole; invitedBy: string }) {
  const token = generateInviteToken();
  const fields = {
    name: input.name,
    role: input.role,
    token_hash: hashInviteToken(token),
    invited_by: input.invitedBy,
    expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString(),
    code_hash: null,
    code_expires_at: null,
    code_attempts: 0,
    code_sent_at: null,
  };

  const { data: existing } = await db()
    .from("team_invites")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("email", input.email)
    .is("accepted_at", null)
    .is("cancelled_at", null)
    .maybeSingle();

  const query = existing
    ? db().from("team_invites").update(fields).eq("id", existing.id).eq("tenant_id", input.tenantId)
    : db().from("team_invites").insert({ tenant_id: input.tenantId, email: input.email, ...fields });
  const { data, error } = await query.select(INVITE_COLUMNS).single();
  if (error || !data) throw new Error(error?.message || "Invite not saved.");
  return { invite: data as InviteRow, token, refreshed: Boolean(existing) };
}

/** A new link for an existing invite (resend). */
export async function refreshInviteToken(invite: InviteRow) {
  const token = generateInviteToken();
  const { error } = await db()
    .from("team_invites")
    .update({
      token_hash: hashInviteToken(token),
      expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString(),
      code_hash: null,
      code_expires_at: null,
      code_attempts: 0,
      code_sent_at: null,
    })
    .eq("id", invite.id)
    .eq("tenant_id", invite.tenant_id);
  if (error) throw new Error(error.message);
  return token;
}

export async function cancelInvite(tenantId: string, inviteId: string) {
  const { data, error } = await db()
    .from("team_invites")
    .update({ cancelled_at: new Date().toISOString(), code_hash: null })
    .eq("tenant_id", tenantId)
    .eq("id", inviteId)
    .is("accepted_at", null)
    .is("cancelled_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** A fresh six-digit code for the invite, replacing any earlier one. */
export async function issueInviteCode(invite: InviteRow) {
  const code = generateInviteCode();
  const now = new Date();
  const { error } = await db()
    .from("team_invites")
    .update({
      code_hash: hashInviteCode(invite.id, code),
      code_expires_at: new Date(now.getTime() + INVITE_CODE_TTL_MINUTES * 60_000).toISOString(),
      code_attempts: 0,
      code_sent_at: now.toISOString(),
    })
    .eq("id", invite.id)
    .eq("tenant_id", invite.tenant_id);
  if (error) throw new Error(error.message);
  return code;
}

export async function recordCodeAttempt(invite: InviteRow) {
  await db()
    .from("team_invites")
    .update({ code_attempts: (invite.code_attempts ?? 0) + 1 })
    .eq("id", invite.id)
    .eq("tenant_id", invite.tenant_id);
}

/** Turns the invite into a membership. 'ok', 'already_member' or 'invalid'. */
export async function acceptInvite(inviteId: string, userId: string) {
  const { data, error } = await db().rpc("accept_team_invite", { p_invite_id: inviteId, p_user_id: userId });
  if (error) throw new Error(error.message);
  return String(data);
}

/** Changes a role, or removes the member when role is null. 'ok', 'not_found', 'invalid' or 'last_owner'. */
export async function changeMember(tenantId: string, userId: string, role: string | null) {
  const { data, error } = await db().rpc("change_store_member", { p_tenant_id: tenantId, p_user_id: userId, p_role: role });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function storeNameAndSlug(tenantId: string) {
  const { data } = await createServerSupabaseClient().from("tenants").select("subdomain, name, display_name").eq("id", tenantId).eq("product", "store").maybeSingle();
  if (!data) return null;
  const slug = String(data.subdomain || data.name || "");
  return { slug, storeName: (data.display_name as string | null)?.trim() || slug };
}

export const inviteLink = (token: string) => `${EMAIL_SITE_URL}/join/${token}`;

/** The invitation email. The link carries the token; nothing else in it lets anyone in. */
export async function sendInviteEmail(input: { to: string; name: string; storeName: string; role: InvitableRole; invitedByName: string; token: string }) {
  const roleLabel = STORE_ROLE_LABELS[input.role];
  const link = inviteLink(input.token);
  const intro = `Hello ${input.name}, ${input.invitedByName} has invited you to help run ${input.storeName} on XYVOO, as ${roleLabel === "Admin" ? "an" : "a"} ${roleLabel}.`;
  await sendBrandedEmail({
    to: input.to,
    subject: `${input.invitedByName} invited you to ${input.storeName} on XYVOO`,
    text: [
      intro,
      "",
      `${roleLabel}: ${ROLE_DESCRIPTIONS[input.role]}`,
      "",
      `Accept the invitation: ${link}`,
      `You'll sign in, or create a free account with this email address, and enter a code we email you. The link works for ${INVITE_TTL_DAYS} days.`,
      "",
      "If you weren't expecting this, you can ignore this email.",
    ].join("\n"),
    layout: {
      preheader: `Join ${input.storeName} as ${roleLabel === "Admin" ? "an" : "a"} ${roleLabel}. The link works for ${INVITE_TTL_DAYS} days.`,
      badges: [badge("Team invitation", "blue")],
      title: `Join ${input.storeName}`,
      intro,
      body: `${detailsPanel([
        { label: "Shop", value: input.storeName },
        { label: "Your role", value: roleLabel },
        { label: "What you can do", value: ROLE_DESCRIPTIONS[input.role] },
        { label: "Invited by", value: input.invitedByName },
      ])}
      <p style="margin:20px 0 0;color:#1e293b;font-size:15px;line-height:1.6">You'll sign in, or create a free account with <strong>${escapeHtml(input.to)}</strong>, then enter a code we email you. The link works for ${INVITE_TTL_DAYS} days.</p>`,
      buttons: [{ label: "Accept the invitation", href: link }],
      footerNote: "You're receiving this because a shop on XYVOO invited this address to its team. If you weren't expecting it, you can ignore this email.",
    },
  });
}

export async function sendInviteCodeEmail(input: { to: string; name: string; storeName: string; code: string }) {
  await sendBrandedEmail({
    to: input.to,
    subject: `Your code to join ${input.storeName}`,
    text: `Hello ${input.name}, your code to join ${input.storeName} on XYVOO is ${input.code}. It expires in ${INVITE_CODE_TTL_MINUTES} minutes.\n\nIf you didn't ask for it, you can ignore this email.`,
    layout: {
      preheader: `Your code is ${input.code}. It expires in ${INVITE_CODE_TTL_MINUTES} minutes.`,
      badges: [badge("Verification")],
      title: `Your code to join ${input.storeName}`,
      intro: `Hello ${input.name}, enter this code to join the team.`,
      body: `<div style="margin:0 0 20px;padding:24px;border:1px dashed #007edf;border-radius:12px;background:#f5faff;text-align:center">
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#000d1f;font-family:'Courier New',monospace">${escapeHtml(input.code)}</div>
        <div style="margin-top:8px;font-size:13px;color:#64748b">Expires in ${INVITE_CODE_TTL_MINUTES} minutes</div>
      </div>
      <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6">If you didn't ask for this code, you can ignore this email. Nobody can join without it.</p>`,
      footerNote: "You're receiving this because someone is accepting a team invitation for this address on XYVOO.",
    },
  });
}
