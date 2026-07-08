/** Parse fixture date strings into ISO timestamps. */
export function resolveFixtureDate(input: string, now = new Date()): string {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(trimmed)) {
    return trimmed.includes("T") ? new Date(trimmed).toISOString() : `${trimmed}T00:00:00.000Z`;
  }

  const match = trimmed.match(/^(today|now)(.*)$/i);
  if (!match) {
    throw new Error(`Unrecognized date expression: "${input}"`);
  }

  const baseKind = match[1].toLowerCase();
  const rest = match[2] ?? "";
  const base =
    baseKind === "today"
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      : new Date(now.getTime());

  const offsetRe = /([+-])(\d+)(h|d)/gi;
  let m: RegExpExecArray | null;
  while ((m = offsetRe.exec(rest)) !== null) {
    const sign = m[1] === "-" ? -1 : 1;
    const amount = Number(m[2]);
    const unit = m[3].toLowerCase();
    if (unit === "h") base.setTime(base.getTime() + sign * amount * 3_600_000);
    else base.setUTCDate(base.getUTCDate() + sign * amount);
  }

  return base.toISOString();
}

export function resolveFixtureDateOnly(input: string, now = new Date()): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) return input.trim();
  return resolveFixtureDate(input, now).slice(0, 10);
}
