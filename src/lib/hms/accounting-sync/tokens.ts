import { DriverError, type AccountingDriver, type TokenSet } from "@/lib/hms/accounting-sync/driver";

/**
 * Keeps a hotel's access token fresh. Sage rotates the refresh token on every refresh (the old one is
 * spent at once), so two processes must never refresh together: a short database lock makes one of
 * them do it while the other waits and then reads the new token.
 */

export type StoredTokens = {
  status: "connected" | "needs_reauth" | "disconnected" | "pending_business";
  accessToken: string | null;
  refreshToken: string | null;
  accessExpiresAt: Date | null;
};

export interface TokenStore {
  load(): Promise<StoredTokens | null>;
  /** Atomic compare-and-set: true only for the one caller that got the lock. */
  tryLock(untilIso: string): Promise<boolean>;
  /** Writes both new tokens in a single update and clears the lock. */
  save(tokens: TokenSet, now: Date): Promise<void>;
  releaseLock(): Promise<void>;
  markNeedsReauth(message: string): Promise<void>;
}

const EXPIRY_MARGIN_MS = 60_000;
const LOCK_MS = 30_000;
const WAIT_MS = 2_000;
const WAIT_ROUNDS = 4;

function fresh(t: StoredTokens | null, now: Date): t is StoredTokens & { accessToken: string } {
  return !!t && t.status === "connected" && !!t.accessToken && !!t.accessExpiresAt && t.accessExpiresAt.getTime() - EXPIRY_MARGIN_MS > now.getTime();
}

export async function ensureAccessToken(
  store: TokenStore,
  driver: Pick<AccountingDriver, "refreshAuth">,
  opts: { now?: () => Date; sleep?: (ms: number) => Promise<void> } = {},
): Promise<string> {
  const now = opts.now ?? (() => new Date());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  for (let round = 0; round < WAIT_ROUNDS; round += 1) {
    const current = await store.load();
    if (!current || current.status !== "connected" || !current.refreshToken) {
      throw new DriverError("auth", "Sage is not connected. Connect it again.");
    }
    if (fresh(current, now())) return current.accessToken;

    if (!(await store.tryLock(new Date(now().getTime() + LOCK_MS).toISOString()))) {
      await sleep(WAIT_MS);
      continue;
    }

    try {
      // Someone may have refreshed between our read and our lock: read again before spending the token.
      const latest = await store.load();
      if (fresh(latest, now())) {
        await store.releaseLock();
        return latest.accessToken;
      }
      if (!latest || latest.status !== "connected" || !latest.refreshToken) {
        await store.releaseLock();
        throw new DriverError("auth", "Sage is not connected. Connect it again.");
      }

      let tokens: TokenSet;
      try {
        tokens = await driver.refreshAuth(latest.refreshToken);
      } catch (e) {
        if (e instanceof DriverError && e.kind === "auth") {
          await store.markNeedsReauth("Sage no longer accepts this connection. Connect Sage again.");
          throw e;
        }
        await store.releaseLock();
        throw e;
      }

      try {
        await store.save(tokens, now());
      } catch {
        // The old refresh token is already spent; try once more, then give up and ask for a reconnect.
        try {
          await store.save(tokens, now());
        } catch {
          await store.markNeedsReauth("Could not save the new Sage tokens. Connect Sage again.");
          throw new DriverError("auth", "Could not save refreshed Sage tokens.");
        }
      }
      return tokens.accessToken;
    } finally {
      // Harmless when save() already cleared it; frees the lock on any other exit.
      await store.releaseLock().catch(() => undefined);
    }
  }
  throw new DriverError("transient", "Another sync is refreshing the Sage connection; try again shortly.");
}
