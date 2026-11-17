import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/env";

/*
 * Shared screens. A front desk terminal is signed in once with a password; the people using it take turns
 * by PIN. This cookie says who is "at the keys" right now, or that the screen is locked:
 *   a = the person whose PIN is active (every action is stamped with them); null = locked
 *   s = the login the browser signed in with (the cookie is worthless in anyone else's browser session)
 * It is signed, so the browser can't edit it, and bound to one hotel. Locking is enforced here on the server:
 * a locked screen's requests are refused until a PIN is entered.
 */

export type ActiveState = { t: string; s: string; a: string | null; n: string | null; exp: number };

const MAX_AGE_SECONDS = 12 * 60 * 60;

export const activeCookieName = (tenantId: string) => `hms_active_${tenantId}`;

function key() {
  return createHmac("sha256", "hms-active-person").update(getServerEnv().serviceRoleKey).digest();
}

export function signActiveState(state: ActiveState): string {
  const body = Buffer.from(JSON.stringify(state)).toString("base64url");
  const mac = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyActiveState(value: string | undefined, tenantId: string, sessionUserId: string, now = Date.now()): ActiveState | null {
  if (!value) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", key()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const state = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ActiveState;
    if (state.t !== tenantId || state.s !== sessionUserId || state.exp < now) return null;
    return state;
  } catch {
    return null;
  }
}

export type EffectiveUser = {
  /** The person whose standing and name apply. Differs from the session login after a PIN switch. */
  userId: string;
  name: string | null;
  locked: boolean;
  switched: boolean;
};

/** Who is acting in this browser at this hotel: the signed-in login, or the person who switched in by PIN. */
export async function resolveEffectiveUser(tenantId: string, sessionUserId: string): Promise<EffectiveUser> {
  let state: ActiveState | null = null;
  try {
    const store = await cookies();
    state = verifyActiveState(store.get(activeCookieName(tenantId))?.value, tenantId, sessionUserId);
  } catch {
    state = null; // not in a request (tests, background work)
  }
  if (!state) return { userId: sessionUserId, name: null, locked: false, switched: false };
  if (state.a === null) return { userId: sessionUserId, name: null, locked: true, switched: false };
  return { userId: state.a, name: state.n, locked: false, switched: state.a !== sessionUserId };
}

/** Sets who is active (or locks the screen with `active = null`). Route handlers only. */
export async function setActiveState(tenantId: string, sessionUserId: string, active: { userId: string; name: string } | null) {
  const state: ActiveState = {
    t: tenantId,
    s: sessionUserId,
    a: active?.userId ?? null,
    n: active?.name ?? null,
    exp: Date.now() + MAX_AGE_SECONDS * 1000,
  };
  const store = await cookies();
  store.set(activeCookieName(tenantId), signActiveState(state), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}
