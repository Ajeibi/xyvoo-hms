import { parseJson, realFetch, timedFetch, type FetchLike } from "../../http-fetch";
import type { LockProvider, LockResult } from "../types";

/** Pretends to work, so staff can practise and tests have something to call. Keeps its codes in memory. */
export function createMockLockProvider(): LockProvider {
  return {
    id: "mock",
    async testConnection() {
      return { ok: true, data: { lockCount: 0 } };
    },
    async listLocks() {
      return { ok: true, data: { locks: [] } };
    },
    async issueCode(input) {
      return { ok: true, data: { externalCodeId: `mock-${input.externalLockId}-${input.startsAt.getTime()}`, code: input.code } };
    },
    async revokeCode() {
      return { ok: true, data: {} };
    },
    async remoteUnlock() {
      return { ok: true, data: {} };
    },
  };
}

/**
 * A lock server run by the hotel or its installer. It must accept JSON POSTs to /unlock, /issue and
 * /revoke and answer with a 2xx. /issue may answer { "id": "...", "code": "123456" }.
 */
export function createHttpLockProvider(opts: { apiBaseUrl: string; apiKey?: string; fetchImpl?: FetchLike }): LockProvider {
  const f = opts.fetchImpl ?? realFetch;
  const base = opts.apiBaseUrl.replace(/\/$/, "");
  async function send(path: string, body: Record<string, unknown>): Promise<LockResult<Record<string, unknown>>> {
    try {
      const res = await timedFetch(f, `${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}) },
        body: JSON.stringify(body),
      });
      if (!res.ok) return { ok: false, error: `Lock server returned ${res.status}.`, retryable: res.status === 429 || res.status >= 500 };
      return { ok: true, data: parseJson(await res.text().catch(() => "")) };
    } catch {
      return { ok: false, error: "Could not reach the lock server.", retryable: true };
    }
  }
  const strip = (r: LockResult<Record<string, unknown>>): LockResult => (r.ok ? { ok: true, data: {} } : r);
  return {
    id: "http_webhook",
    async testConnection() {
      const r = await send("/unlock", { test: true });
      return r.ok ? { ok: true, data: { lockCount: 0 } } : r;
    },
    async listLocks() {
      return { ok: true, data: { locks: [] } };
    },
    async issueCode(input) {
      const r = await send("/issue", {
        roomId: input.externalLockId,
        code: input.code,
        startsAt: input.startsAt.toISOString(),
        endsAt: input.endsAt.toISOString(),
        label: input.label,
      });
      if (!r.ok) return r;
      const id = r.data.id;
      const code = r.data.code;
      return { ok: true, data: { externalCodeId: typeof id === "string" || typeof id === "number" ? String(id) : null, code: typeof code === "string" ? code : input.code } };
    },
    async revokeCode({ externalLockId, externalCodeId }) {
      return strip(await send("/revoke", { roomId: externalLockId, codeId: externalCodeId }));
    },
    async remoteUnlock({ externalLockId }) {
      return strip(await send("/unlock", { roomId: externalLockId }));
    },
  };
}
