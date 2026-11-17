import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Who did it. Every HMS write route signs the caller in on the server (requireHotelApiMember) and gets back
 * a database client that stamps the person onto the rows it writes. The person comes from the session,
 * never from the request body, so a browser can't claim to be someone else.
 *
 * The stamp is applied by wrapping the client: when code inserts or updates a table listed below, the
 * person's id and name are added to the row (unless the code already set them). This covers every route
 * and library function that is handed the signed-in member's client, with no per-route changes.
 * It stays off until migration 20261215110000 has run (probed once, then remembered), so nothing breaks before then.
 */

export type Actor = {
  userId: string;
  /** The person's name now; copied onto each row so history keeps it. */
  name: string;
  department: string | null;
  staffLevel: "hod" | "staff";
  role: string;
};

type Approver = { userId: string; name: string };
type State = { actor: Actor; tenantId: string; approver: Approver | null };

const states = new WeakMap<object, State>();

/** The actor (and approver, once a head of department approved something) behind a stamped client. */
export function attributionOf(service: SupabaseClient): State | undefined {
  return states.get(service as unknown as object);
}

/** Remembers who approved the current request, so the action's own log line names them too. */
export function setApprover(service: SupabaseClient, approver: Approver) {
  const state = attributionOf(service);
  if (!state) return;
  state.approver = approver;
  // Log lines written by older code use a client of their own; they pick the approver up from here (see takePendingApprover).
  pending.set(`${state.tenantId}:${state.actor.userId}`, { approver, at: Date.now() });
}

const pending = new Map<string, { approver: Approver; at: number }>();
const PENDING_MS = 10_000;

/**
 * The approver the same person just used, for the log line of the action they approved. Taken once and only
 * for ten seconds, so a later action of theirs is never logged as approved by mistake.
 */
export function takePendingApprover(tenantId: string, actorUserId: string | null): Approver | null {
  if (!actorUserId) return null;
  const key = `${tenantId}:${actorUserId}`;
  const hit = pending.get(key);
  if (!hit) return null;
  pending.delete(key);
  return Date.now() - hit.at <= PENDING_MS ? hit.approver : null;
}

/** A person's display name from what the session token carries. */
export function actorDisplayName(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }, username?: string | null): string {
  const meta = user.user_metadata ?? {};
  for (const key of ["full_name", "name"] as const) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (username) return username;
  const email = user.email ?? "";
  return email ? email.split("@")[0] : "Staff";
}

// ---- the columns each table gets -------------------------------------------------------------

type Row = Record<string, unknown>;
type Rule = (actor: Actor, row: Row) => Row;

const createdBy: Rule = (a) => ({ created_by: a.userId, created_by_name: a.name });
const authorName: Rule = (a) => ({ author_name: a.name });

const INSERT_RULES: Record<string, Rule> = {
  reservation_deposits: createdBy,
  fb_order_items: createdBy,
  guests: createdBy,
  reservation_guests: createdBy,
  group_bookings: createdBy,
  inventory_items: createdBy,
  vendors: createdBy,
  discount_packages: createdBy,
  pos_terminals: createdBy,
  online_checkins: createdBy,
  maintenance_technicians: createdBy,
  reservations: createdBy,
  shift_notes: authorName,
  room_unit_notes: authorName,
  guest_request_notes: authorName,
  room_unit_flags: (a) => ({ set_by: a.userId, set_by_name: a.name }),
  room_key_events: (a) => ({ staff_name: a.name }),
  cash_float_sessions: (a) => ({ opened_by_name: a.name }),
};

const UPDATE_RULES: Record<string, Rule> = {
  reservations: (a, row) => ({
    modified_by: a.userId,
    modified_by_name: a.name,
    ...("checked_out_at" in row ? { checked_out_by: a.userId, checked_out_by_name: a.name } : {}),
    ...("checked_in_by_staff_id" in row ? { checked_in_by_name: a.name } : {}),
  }),
  guests: (a) => ({ updated_by: a.userId, updated_by_name: a.name }),
  cash_float_sessions: (a, row) => ("closed_at" in row && row.closed_at ? { closed_by_name: a.name } : {}),
  housekeeping_tasks: (a, row) => ({
    ...("started_at" in row && row.started_at ? { started_by: a.userId, started_by_name: a.name } : {}),
    ...("completed_at" in row && row.completed_at ? { completed_by: a.userId, completed_by_name: a.name } : {}),
  }),
};

function stampValues(op: "insert" | "update" | "upsert", table: string, values: unknown, actor: Actor): unknown {
  const stampOne = (row: Row): Row => {
    const add: Row = {
      ...(op !== "update" ? INSERT_RULES[table]?.(actor, row) : null),
      ...(op !== "insert" ? UPDATE_RULES[table]?.(actor, row) : null),
    };
    // Whatever the code already set wins; the stamp only fills what is missing.
    return Object.keys(add).length ? { ...add, ...row } : row;
  };
  if (Array.isArray(values)) return values.map((v) => (v && typeof v === "object" ? stampOne(v as Row) : v));
  if (values && typeof values === "object") return stampOne(values as Row);
  return values;
}

function wrapBuilder(builder: object, table: string, actor: Actor, stamp: boolean) {
  return new Proxy(builder, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      if (stamp && (prop === "insert" || prop === "update" || prop === "upsert")) {
        return (values: unknown, ...rest: unknown[]) => value.call(target, stampValues(prop, table, values, actor), ...rest);
      }
      return value.bind(target);
    },
  });
}

function wrapClient(client: object, schema: string | null, actor: Actor, stamp: boolean): object {
  return new Proxy(client, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      if (prop === "schema") return (name: string) => wrapClient(value.call(target, name) as object, name, actor, stamp);
      if (prop === "from" && schema === "hotel") return (table: string) => wrapBuilder(value.call(target, table) as object, table, actor, stamp);
      return value.bind(target);
    },
  });
}

// ---- is the migration in? --------------------------------------------------------------------

let readyUntil = 0;
let ready = false;

/** Whether the stamp columns exist yet. Checked at most once a minute (once an hour when they do). */
export async function attributionReady(service: SupabaseClient): Promise<boolean> {
  if (Date.now() < readyUntil) return ready;
  const { error } = await service.schema("hotel").from("reservations").select("created_by, modified_by, checked_out_by").limit(1);
  ready = !error;
  readyUntil = Date.now() + (ready ? 60 * 60_000 : 60_000);
  return ready;
}

/**
 * The signed-in member's database client. With the migration in place it stamps `actor` onto what it writes;
 * either way it remembers the actor so the activity log and approvals can name them.
 */
export async function attributedService(service: SupabaseClient, tenantId: string, actor: Actor): Promise<SupabaseClient> {
  const stamping = await attributionReady(service);
  // Always a wrapper of its own, so the remembered actor can never leak between requests that share a client.
  const client = wrapClient(service as unknown as object, null, actor, stamping) as unknown as SupabaseClient;
  states.set(client as unknown as object, { actor, tenantId, approver: null });
  return client;
}

// Exposed for tests.
export const __test = { stampValues };
