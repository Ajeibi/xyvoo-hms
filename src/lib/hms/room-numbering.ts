/** Single room display code (aligned with DB text, no newlines). */
const ROOM_CODE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._\-\s]{0,31}$/;

export function isValidRoomCodeToken(code: string): boolean {
  const t = code.trim();
  return t.length > 0 && t.length <= 32 && ROOM_CODE_TOKEN.test(t);
}

/**
 * Expand a floor room-number spec to the list of codes it denotes (no room-count check).
 * Use for overlap detection when the typed list does not yet match "Rooms on floor".
 * - Semicolon separates segments: `1-10; 20-25`
 * - Range: `101-110` or `101–110` (ASCII or en-dash)
 * - Comma list: `101, 102, 105`
 */
export function expandRoomNumbersSpec(
  raw: string,
): { ok: true; codes: string[] } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) {
    return { ok: false, error: "Empty numbering." };
  }

  const segments = text
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  const out: string[] = [];

  for (const seg of segments) {
    const rangeMatch = seg.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (rangeMatch) {
      let lo = parseInt(rangeMatch[1], 10);
      let hi = parseInt(rangeMatch[2], 10);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
        return { ok: false, error: `Invalid range: "${seg}".` };
      }
      if (lo > hi) [lo, hi] = [hi, lo];
      for (let n = lo; n <= hi; n += 1) {
        out.push(String(n));
      }
      continue;
    }

    if (seg.includes(",")) {
      for (const part of seg.split(",")) {
        const c = part.trim();
        if (!c) continue;
        out.push(c);
      }
      continue;
    }

    out.push(seg);
  }

  for (const c of out) {
    if (!isValidRoomCodeToken(c)) {
      return {
        ok: false,
        error: `Invalid room number "${c}". Use letters/digits first; up to 32 characters; spaces, hyphen, underscore, dot allowed.`,
      };
    }
  }

  const seen = new Set<string>();
  for (const c of out) {
    const k = c.trim();
    if (seen.has(k)) {
      return { ok: false, error: `Duplicate room number in list: "${k}".` };
    }
    seen.add(k);
  }

  return { ok: true, codes: out.map((c) => c.trim()) };
}

/**
 * Parse floor room-number spec into exactly `expectedCount` codes.
 * - Semicolon separates segments: `1-10; 20-25`
 * - Range: `101-110` or `101–110` (ASCII or en-dash)
 * - Comma list: `101, 102, 105`
 * - Single token when count is 1
 */
export function parseRoomNumbersSpec(
  raw: string,
  expectedCount: number,
): { ok: true; codes: string[] } | { ok: false; error: string } {
  if (expectedCount < 1) {
    return { ok: false, error: "Room count must be at least 1." };
  }

  const expanded = expandRoomNumbersSpec(raw);
  if (!expanded.ok) {
    return expanded;
  }

  const text = raw.trim();
  const segments = text
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  const out = expanded.codes;

  if (out.length !== expectedCount) {
    let hint =
      "Ranges include both ends — every number from the start through the last counts. Shorten or lengthen the list, or change \"Rooms on floor\", until the count matches.";
    if (segments.length === 1) {
      const seg = segments[0]!;
      const rangeMatch = seg.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (rangeMatch) {
        let lo = parseInt(rangeMatch[1], 10);
        let hi = parseInt(rangeMatch[2], 10);
        if (Number.isFinite(lo) && Number.isFinite(hi)) {
          if (lo > hi) [lo, hi] = [hi, lo];
          const endForN = lo + expectedCount - 1;
          if (Number.isFinite(endForN) && endForN >= lo) {
            if (out.length > expectedCount) {
              hint = `You used one range (${lo}–${hi}), which is ${out.length} numbers. For ${expectedCount} rooms on this floor starting at ${lo}, use ${lo}–${endForN} (${lo} through ${endForN} inclusive).`;
            } else {
              hint = `You used one range (${lo}–${hi}), which is only ${out.length} number(s). For ${expectedCount} rooms starting at ${lo}, extend to ${lo}–${endForN} (${lo} through ${endForN} inclusive).`;
            }
          }
        }
      }
    }

    return {
      ok: false,
      error: `This floor has ${expectedCount} room(s), but the numbering you typed expands to ${out.length}. ${hint}`,
    };
  }

  return { ok: true, codes: out };
}
