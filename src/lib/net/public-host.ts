import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/*
 * For fetching something a merchant pointed us at (a social site's icon, a
 * product photo on another site): only hosts on the public internet, never
 * anything that could reach our own network.
 */

/** A loopback, private, link-local, carrier-grade NAT or multicast address. */
export function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || (ip.startsWith("::ffff:") && isPrivateAddress(ip.slice(7)));
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** True when the host name resolves, and only to public addresses. */
export async function isPublicHost(host: string) {
  if (isIP(host) || host === "localhost" || /\.(local|internal|localhost)$/i.test(host)) return false;
  try {
    const addresses = await lookup(host, { all: true });
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}
