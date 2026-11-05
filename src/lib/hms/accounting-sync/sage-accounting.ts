import {
  DriverError,
  type AccountingDriver,
  type DriverContext,
  type ExternalAccount,
  type ExternalBusiness,
  type ExternalTaxRate,
  type SyncJournal,
  type TokenSet,
} from "@/lib/hms/accounting-sync/driver";
import { centsToAmount } from "@/lib/hms/accounting-sync/payload";
import { parseRetryAfter } from "@/lib/hms/accounting-sync/policy";

/**
 * Sage Accounting (REST API v3.1) driver.
 *
 * Endpoints and field names come from Sage's developer docs as reported by secondary sources (the docs
 * site itself blocked automated fetching); see the delivery notes for what is and is not confirmed.
 * Nothing here logs tokens, codes or secrets.
 */

export const SAGE_AUTHORIZE_URL = "https://www.sageone.com/oauth2/auth/central";
export const SAGE_TOKEN_URL = "https://oauth.accounting.sage.com/token";
export const SAGE_REVOKE_URL = "https://oauth.accounting.sage.com/revoke";
export const SAGE_API_BASE = "https://api.accounting.sage.com/v3.1";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type SageConfig = { clientId: string; clientSecret: string; redirectUri: string };

export function loadSageConfig(): SageConfig {
  const clientId = process.env.SAGE_CLIENT_ID;
  const clientSecret = process.env.SAGE_CLIENT_SECRET;
  const redirectUri = process.env.SAGE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Sage is not configured: set SAGE_CLIENT_ID, SAGE_CLIENT_SECRET and SAGE_REDIRECT_URI.");
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(config: SageConfig, state: string, country?: string | null): string {
  const url = new URL(SAGE_AUTHORIZE_URL);
  url.searchParams.set("filter", "apiv3.1");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "full_access");
  url.searchParams.set("state", state);
  if (country) url.searchParams.set("country", country);
  return url.toString();
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

function toTokenSet(body: TokenResponse): TokenSet {
  if (!body.access_token || !body.refresh_token) throw new DriverError("permanent", "Sage returned no tokens.");
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: Number(body.expires_in) || 300,
    refreshExpiresIn: body.refresh_token_expires_in ? Number(body.refresh_token_expires_in) : null,
  };
}

type ListResponse<T> = { $items?: T[]; $next?: string | null };

export function createSageDriver(config: SageConfig, fetchImpl: FetchLike = fetch): AccountingDriver & {
  exchangeCode(code: string): Promise<TokenSet>;
  listBusinesses(accessToken: string): Promise<ExternalBusiness[]>;
  revoke(refreshToken: string): Promise<void>;
} {
  async function request(url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      throw new DriverError("transient", e instanceof Error ? `Could not reach Sage: ${e.name}` : "Could not reach Sage.");
    }
    if (res.ok) return res;
    const text = (await res.text().catch(() => "")).slice(0, 400);
    if (res.status === 429) throw new DriverError("rate_limit", "Sage rate limit reached.", parseRetryAfter(res.headers.get("retry-after")));
    if (res.status === 401 || res.status === 403) throw new DriverError("auth", `Sage rejected the connection (${res.status}).`);
    if (res.status >= 500 || res.status === 408) throw new DriverError("transient", `Sage error ${res.status}.`);
    throw new DriverError("permanent", `Sage refused the request (${res.status}): ${text}`);
  }

  function authed(ctx: DriverContext, extra?: Record<string, string>): RequestInit["headers"] {
    return {
      Authorization: `Bearer ${ctx.accessToken}`,
      "X-Business": ctx.businessId,
      Accept: "application/json",
      ...extra,
    };
  }

  async function listAll<T>(ctx: DriverContext, path: string, query: Record<string, string> = {}): Promise<T[]> {
    const out: T[] = [];
    const first = new URL(`${SAGE_API_BASE}${path}`);
    for (const [k, v] of Object.entries({ items_per_page: "200", ...query })) first.searchParams.set(k, v);
    let next: string | null = first.toString();
    for (let page = 0; next && page < 50; page += 1) {
      const res: Response = await request(next, { headers: authed(ctx) });
      const body = (await res.json()) as ListResponse<T>;
      out.push(...(body.$items ?? []));
      // $next is a path relative to the API host in some responses.
      next = body.$next ? (body.$next.startsWith("http") ? body.$next : `https://api.accounting.sage.com${body.$next}`) : null;
    }
    return out;
  }

  async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
    const res = await request(SAGE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }).toString(),
    }).catch((e) => {
      // A rejected code or refresh token means the person must connect again.
      if (e instanceof DriverError && e.kind === "permanent") throw new DriverError("auth", "Sage no longer accepts this authorisation.");
      throw e;
    });
    return toTokenSet((await res.json()) as TokenResponse);
  }

  return {
    provider: "sage_accounting",

    async exchangeCode(code) {
      return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri });
    },

    async refreshAuth(refreshToken) {
      return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    },

    async revoke(refreshToken) {
      await request(SAGE_REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, token: refreshToken }).toString(),
      });
    },

    async listBusinesses(accessToken) {
      const res = await request(`${SAGE_API_BASE}/businesses?items_per_page=200`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      const body = (await res.json()) as ListResponse<{ id: string; name?: string; displayed_as?: string; base_currency?: { id?: string } }>;
      return (body.$items ?? []).map((b) => ({
        id: b.id,
        name: b.name || b.displayed_as || b.id,
        currency: b.base_currency?.id ? b.base_currency.id.toUpperCase() : null,
      }));
    },

    async listAccounts(ctx): Promise<ExternalAccount[]> {
      const items = await listAll<{ id: string; displayed_as?: string; name?: string; nominal_code?: number | string; ledger_account_type?: { id?: string } }>(ctx, "/ledger_accounts");
      return items.map((a) => ({
        id: a.id,
        code: a.nominal_code != null ? String(a.nominal_code) : null,
        name: a.name || a.displayed_as || a.id,
        type: a.ledger_account_type?.id ?? null,
      }));
    },

    async listTaxRates(ctx): Promise<ExternalTaxRate[]> {
      const items = await listAll<{ id: string; displayed_as?: string; name?: string; percentage?: number | string }>(ctx, "/tax_rates");
      return items.map((t) => ({
        id: t.id,
        name: t.name || t.displayed_as || t.id,
        percentage: t.percentage != null ? Number(t.percentage) : null,
      }));
    },

    async pushJournal(ctx, journal: SyncJournal) {
      const res = await request(`${SAGE_API_BASE}/journals`, {
        method: "POST",
        headers: authed(ctx, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          journal: {
            date: journal.date,
            reference: journal.reference,
            description: journal.description,
            journal_lines: journal.lines.map((l) => ({
              ledger_account_id: l.externalAccountId,
              details: l.details,
              debit: centsToAmount(l.debitCents),
              credit: centsToAmount(l.creditCents),
            })),
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      if (!body.id) throw new DriverError("transient", "Sage accepted the journal but returned no id; it will be checked before any retry.");
      return { externalId: body.id };
    },

    async findJournalByReference(ctx, reference, date) {
      const items = await listAll<{ id: string; reference?: string }>(ctx, "/journals", { from_date: date, to_date: date });
      const hit = items.find((j) => j.reference === reference);
      return hit ? { externalId: hit.id } : null;
    },
  };
}
