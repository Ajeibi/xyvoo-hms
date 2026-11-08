import { createHash } from "node:crypto";
import { parseJson, realFetch, timedFetch, type FetchLike } from "../../http-fetch";
import type { IssueCodeInput, IssuedCode, LockProvider, LockResult, ProviderLock } from "../types";

/*
 * The only file that knows TTLock. Written from the TTLock Open Platform documentation
 * (euopen.ttlock.com): form-encoded POSTs to https://euapi.ttlock.com, one XYVOO developer app
 * (clientId and clientSecret in env) with each hotel signing in to its own TTLock account, an access
 * token that is refreshed with the refresh token, millisecond timestamps, and errors as
 * { errcode, errmsg } (absent or 0 means success).
 *
 * Things to check against a real TTLock account and gateway (marked VERIFY): the errcode for an
 * expired token (10003), the battery field of /v3/lock/list (electricQuantity), and whether the
 * region (euapi or api) matches where the hotel's account was made.
 */

export type TtlockTokens = { accessToken: string; refreshToken: string; expiresAt: number };

export type TtlockOptions = {
  clientId?: string;
  clientSecret?: string;
  baseUrl?: string;
  tokens: TtlockTokens | null;
  /** True when the hotel has a TTLock gateway, so a code can be set remotely with our own digits. */
  hasGateway?: boolean;
  /** Called whenever the tokens were refreshed, so the caller can store them. */
  onTokens?: (t: TtlockTokens) => Promise<void> | void;
  fetchImpl?: FetchLike;
  now?: () => number;
};

const DEFAULT_BASE = "https://euapi.ttlock.com";
const EXPIRED_TOKEN_CODES = new Set([10003, 10004]); // VERIFY

export const md5 = (s: string) => createHash("md5").update(s).digest("hex");

function form(data: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) if (v !== undefined) p.set(k, String(v));
  return p.toString();
}

type Reply = { ok: true; json: Record<string, unknown> } | { ok: false; error: string; retryable: boolean; code?: number };

export function ttlockCredentialsFromEnv() {
  return {
    clientId: process.env.TTLOCK_CLIENT_ID?.trim() || undefined,
    clientSecret: process.env.TTLOCK_CLIENT_SECRET?.trim() || undefined,
    baseUrl: process.env.TTLOCK_BASE_URL?.trim() || undefined,
  };
}

/** Signs a hotel in to its own TTLock account. The password is hashed and used once; it is never kept. */
export async function ttlockSignIn(
  opts: Pick<TtlockOptions, "clientId" | "clientSecret" | "baseUrl" | "fetchImpl" | "now">,
  username: string,
  password: string,
): Promise<LockResult<TtlockTokens>> {
  const env = ttlockCredentialsFromEnv();
  const clientId = opts.clientId ?? env.clientId;
  const clientSecret = opts.clientSecret ?? env.clientSecret;
  if (!clientId || !clientSecret) {
    return { ok: false, error: "TTLock is not set up on this server yet (TTLOCK_CLIENT_ID / TTLOCK_CLIENT_SECRET).", retryable: false };
  }
  const base = (opts.baseUrl ?? env.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  const r = await post(opts.fetchImpl ?? realFetch, `${base}/oauth2/token`, {
    clientId,
    clientSecret,
    username,
    password: md5(password),
  });
  if (!r.ok) return { ok: false, error: r.error, retryable: r.retryable };
  return tokensFrom(r.json, opts.now ?? Date.now);
}

function tokensFrom(json: Record<string, unknown>, now: () => number): LockResult<TtlockTokens> {
  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  const refreshToken = typeof json.refresh_token === "string" ? json.refresh_token : "";
  const expiresIn = Number(json.expires_in);
  if (!accessToken || !refreshToken) return { ok: false, error: "TTLock did not return a login.", retryable: false };
  return {
    ok: true,
    data: { accessToken, refreshToken, expiresAt: now() + (Number.isFinite(expiresIn) ? expiresIn : 7776000) * 1000 },
  };
}

async function post(f: FetchLike, url: string, data: Record<string, string | number | undefined>): Promise<Reply> {
  let res;
  try {
    res = await timedFetch(f, url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form(data),
    });
  } catch {
    return { ok: false, error: "Could not reach TTLock.", retryable: true };
  }
  const text = await res.text().catch(() => "");
  if (res.status === 429 || res.status >= 500) return { ok: false, error: `TTLock returned ${res.status}.`, retryable: true };
  if (!res.ok) return { ok: false, error: `TTLock returned ${res.status}.`, retryable: false };
  const json = parseJson(text);
  const code = Number(json.errcode ?? 0);
  if (Number.isFinite(code) && code !== 0) {
    return { ok: false, error: String(json.errmsg ?? `TTLock error ${code}`), retryable: false, code };
  }
  return { ok: true, json };
}

export function createTtlockProvider(opts: TtlockOptions): LockProvider {
  const f = opts.fetchImpl ?? realFetch;
  const now = opts.now ?? Date.now;
  const env = ttlockCredentialsFromEnv();
  const clientId = opts.clientId ?? env.clientId;
  const clientSecret = opts.clientSecret ?? env.clientSecret;
  const base = (opts.baseUrl ?? env.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  let tokens = opts.tokens;

  async function refresh(): Promise<LockResult<TtlockTokens>> {
    if (!clientId || !clientSecret || !tokens) {
      return { ok: false, error: "TTLock is not connected. Sign in again in Settings.", retryable: false };
    }
    const r = await post(f, `${base}/oauth2/token`, {
      clientId,
      clientSecret,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });
    if (!r.ok) return { ok: false, error: `TTLock sign-in expired: ${r.error} Sign in again in Settings.`, retryable: r.retryable };
    const t = tokensFrom(r.json, now);
    if (!t.ok) return t;
    tokens = t.data;
    await opts.onTokens?.(t.data);
    return t;
  }

  /** One authenticated call. Refreshes the login first when it is about to lapse, and once more if TTLock says it did. */
  async function call(path: string, data: Record<string, string | number | undefined>): Promise<Reply> {
    if (!clientId || !clientSecret) {
      return { ok: false, error: "TTLock is not set up on this server yet (TTLOCK_CLIENT_ID / TTLOCK_CLIENT_SECRET).", retryable: false };
    }
    if (!tokens) return { ok: false, error: "TTLock is not connected. Sign in in Settings.", retryable: false };
    if (tokens.expiresAt - now() < 5 * 60000) {
      const r = await refresh();
      if (!r.ok) return { ok: false, error: r.error, retryable: r.retryable };
    }
    const attempt = () => post(f, `${base}${path}`, { clientId, accessToken: tokens!.accessToken, ...data, date: now() });
    let r = await attempt();
    if (!r.ok && r.code !== undefined && EXPIRED_TOKEN_CODES.has(r.code)) {
      const t = await refresh();
      if (!t.ok) return { ok: false, error: t.error, retryable: t.retryable };
      r = await attempt();
    }
    return r;
  }

  async function listLocks(): Promise<LockResult<{ locks: ProviderLock[] }>> {
    const locks: ProviderLock[] = [];
    for (let page = 1; page <= 20; page++) {
      const r = await call("/v3/lock/list", { pageNo: page, pageSize: 100 });
      if (!r.ok) return { ok: false, error: r.error, retryable: r.retryable };
      const list = Array.isArray(r.json.list) ? (r.json.list as Record<string, unknown>[]) : [];
      for (const l of list) {
        const id = l.lockId;
        if (id === undefined || id === null) continue;
        const battery = Number(l.electricQuantity);
        locks.push({
          externalLockId: String(id),
          label: String(l.lockAlias ?? l.lockName ?? id),
          battery: Number.isFinite(battery) ? Math.min(100, Math.max(0, battery)) : null,
        });
      }
      const pages = Number(r.json.pages);
      if (!Number.isFinite(pages) || page >= pages || list.length === 0) break;
    }
    return { ok: true, data: { locks } };
  }

  return {
    id: "ttlock",

    async testConnection() {
      const r = await listLocks();
      return r.ok ? { ok: true, data: { lockCount: r.data.locks.length } } : r;
    },

    listLocks,

    async issueCode(input: IssueCodeInput): Promise<LockResult<IssuedCode>> {
      if (input.endsAt.getTime() <= input.startsAt.getTime()) {
        return { ok: false, error: "The code would end before it starts.", retryable: false };
      }
      const lockId = input.externalLockId;
      if (opts.hasGateway) {
        // With a gateway we choose the digits and TTLock pushes them to the lock.
        const r = await call("/v3/keyboardPwd/add", {
          lockId,
          keyboardPwd: input.code,
          keyboardPwdName: input.label.slice(0, 40),
          startDate: input.startsAt.getTime(),
          endDate: input.endsAt.getTime(),
          addType: 2,
        });
        if (!r.ok) return { ok: false, error: r.error, retryable: r.retryable };
        const id = r.json.keyboardPwdId;
        return { ok: true, data: { externalCodeId: id === undefined ? null : String(id), code: input.code } };
      }
      // Without a gateway TTLock makes the code itself; it works once the lock has been touched after it is created.
      const r = await call("/v3/keyboardPwd/get", {
        lockId,
        keyboardPwdVersion: 4,
        keyboardPwdType: 3,
        keyboardPwdName: input.label.slice(0, 40),
        startDate: input.startsAt.getTime(),
        endDate: input.endsAt.getTime(),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable: r.retryable };
      const code = r.json.keyboardPwd;
      if (typeof code !== "string" && typeof code !== "number") {
        return { ok: false, error: "TTLock did not return a code.", retryable: false };
      }
      const id = r.json.keyboardPwdId;
      return { ok: true, data: { externalCodeId: id === undefined ? null : String(id), code: String(code) } };
    },

    async revokeCode({ externalLockId, externalCodeId }) {
      if (!externalCodeId) return { ok: false, error: "No TTLock code id was kept for this code.", retryable: false };
      const r = await call("/v3/keyboardPwd/delete", {
        lockId: externalLockId,
        keyboardPwdId: externalCodeId,
        deleteType: opts.hasGateway ? 2 : 1,
      });
      return r.ok ? { ok: true, data: {} } : { ok: false, error: r.error, retryable: r.retryable };
    },

    async remoteUnlock({ externalLockId }) {
      const r = await call("/v3/lock/unlock", { lockId: externalLockId });
      return r.ok ? { ok: true, data: {} } : { ok: false, error: r.error, retryable: r.retryable };
    },
  };
}
