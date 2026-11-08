import { randomInt } from "node:crypto";

/** Door codes people can type but nobody can guess: no runs (123456), no repeats (111111), no short cycles. */
export function isWeakCode(code: string): boolean {
  if (!/^\d+$/.test(code) || code.length < 4) return true;
  if (/^(\d)\1+$/.test(code)) return true;
  let up = true;
  let down = true;
  for (let i = 1; i < code.length; i++) {
    const d = Number(code[i]) - Number(code[i - 1]);
    if (d !== 1) up = false;
    if (d !== -1) down = false;
  }
  if (up || down) return true;
  for (let n = 1; n <= code.length / 2; n++) {
    if (code.length % n === 0 && code.slice(0, n).repeat(code.length / n) === code) return true;
  }
  return false;
}

/** A random numeric code. `pick` is injectable so tests are repeatable. */
export function generateDoorCode(length = 6, pick: (max: number) => number = (m) => randomInt(m)): string {
  const len = Math.min(9, Math.max(4, Math.floor(length)));
  for (let tries = 0; tries < 100; tries++) {
    let out = "";
    for (let i = 0; i < len; i++) out += String(pick(10));
    if (!isWeakCode(out)) return out;
  }
  // Practically unreachable; a fixed fallback that still passes the rule.
  return "7413902685".slice(0, len);
}

/**
 * When a stay's code should work. Bookings store the departure as the check-out time written as UTC, so the
 * code runs two hours past it (covers Nigeria's UTC+1 and a short grace). An arrival still ahead opens three
 * hours early; a guest already in house starts now.
 */
export function codeWindow(input: { arrivalAt: Date; departureAt: Date; now?: Date }) {
  const now = input.now ?? new Date();
  const startsAt =
    input.arrivalAt.getTime() > now.getTime()
      ? new Date(input.arrivalAt.getTime() - 3 * 3600000)
      : new Date(now.getTime() - 5 * 60000);
  const endsAt = new Date(input.departureAt.getTime() + 2 * 3600000);
  return { startsAt, endsAt };
}
