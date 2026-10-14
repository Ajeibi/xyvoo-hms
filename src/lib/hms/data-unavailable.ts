/**
 * A loader could not get the data it needs (the database timed out, refused or errored).
 * Thrown instead of returning an empty or partial result, so staff are told the screen
 * could not load rather than shown a board that looks complete but is not.
 * (Kept free of server-only imports: some loader modules are also imported by client code.)
 */
export class HmsDataUnavailableError extends Error {
  constructor(
    readonly source: string,
    readonly cause?: unknown,
  ) {
    super(`${source}: data unavailable`);
    this.name = "HmsDataUnavailableError";
  }
}

/** Throws {@link HmsDataUnavailableError} if any Supabase result in the batch failed. */
export function assertQueriesSucceeded(source: string, results: { error: unknown }[]) {
  const failed = results.find((r) => r.error);
  if (!failed) return;
  // Supabase's gateway can answer with a whole HTML error page; log its <title> line, not the page.
  const detail = failed.error as { message?: unknown; code?: unknown };
  const message =
    typeof detail?.message === "string"
      ? (detail.message.split("\n").find((l) => l.includes("<title>"))?.trim() ?? detail.message.slice(0, 200))
      : detail;
  console.error(`[${source}] query failed:`, detail?.code ?? "", message);
  throw new HmsDataUnavailableError(source, failed.error);
}
