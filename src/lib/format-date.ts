/** `Date.prototype.toLocaleString()` without an explicit locale uses each runtime's own default
 * (Node.js on the server vs. the browser on the client), which can differ and produces a
 * hydration mismatch for any component that's server-rendered then hydrated. Pinning a fixed
 * locale here guarantees the server and client always render identical text. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
