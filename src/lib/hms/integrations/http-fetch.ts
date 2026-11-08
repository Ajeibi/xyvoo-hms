/** The few bits of `fetch` the adapters use, so tests can pass a fake. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

export const realFetch: FetchLike = (url, init) => fetch(url, init);

/** Calls with a time limit so a stuck provider cannot hold a request open. */
export async function timedFetch(f: FetchLike, url: string, init: Parameters<FetchLike>[1] = {}, ms = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await f(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function parseJson(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
