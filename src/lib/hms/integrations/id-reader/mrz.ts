import type { IdFields, IdType } from "./types";

/*
 * The machine-readable strip at the foot of passports and many ID cards (ICAO Doc 9303). Reading it is
 * pure arithmetic: every field has a check digit, so a misread character is caught instead of saved.
 */

const WEIGHTS = [7, 3, 1];

function charValue(c: string): number {
  if (c === "<") return 0;
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 55;
  return -1;
}

/** The ICAO check digit for a field, or -1 if it holds a character that can't be on a strip. */
export function mrzCheckDigit(field: string): number {
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    const v = charValue(field[i]);
    if (v < 0) return -1;
    sum += v * WEIGHTS[i % 3];
  }
  return sum % 10;
}

function ok(field: string, digit: string) {
  const d = mrzCheckDigit(field);
  return d >= 0 && String(d) === digit;
}

/** ISO 3166 alpha-3 as printed on strips (note Germany is "D") to the two-letter code the forms keep. */
const ISO3_TO_ISO2: Record<string, string> = {
  NGA: "NG", GHA: "GH", BEN: "BJ", TGO: "TG", NER: "NE", CMR: "CM", SEN: "SN", CIV: "CI", ZAF: "ZA", KEN: "KE",
  UGA: "UG", TZA: "TZ", RWA: "RW", ETH: "ET", EGY: "EG", MAR: "MA", DZA: "DZ", TUN: "TN", SLE: "SL", LBR: "LR",
  GMB: "GM", ZMB: "ZM", ZWE: "ZW", AGO: "AO", GBR: "GB", IRL: "IE", FRA: "FR", D: "DE", DEU: "DE", ESP: "ES",
  ITA: "IT", PRT: "PT", NLD: "NL", BEL: "BE", CHE: "CH", AUT: "AT", SWE: "SE", NOR: "NO", DNK: "DK", FIN: "FI",
  POL: "PL", GRC: "GR", TUR: "TR", RUS: "RU", UKR: "UA", USA: "US", CAN: "CA", MEX: "MX", BRA: "BR", ARG: "AR",
  COL: "CO", CHN: "CN", IND: "IN", PAK: "PK", BGD: "BD", JPN: "JP", KOR: "KR", IDN: "ID", PHL: "PH", MYS: "MY",
  SGP: "SG", THA: "TH", VNM: "VN", ARE: "AE", SAU: "SA", QAT: "QA", ISR: "IL", LBN: "LB", AUS: "AU", NZL: "NZ",
};

export function iso3ToIso2(code: string): string | undefined {
  return ISO3_TO_ISO2[code.replace(/</g, "").toUpperCase()];
}

/** YYMMDD to YYYY-MM-DD. A birth year in the future is last century; an expiry is always this one. */
export function mrzDate(yymmdd: string, kind: "birth" | "expiry", today = new Date()): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const thisYear = today.getUTCFullYear();
  let year = 2000 + yy;
  if (kind === "birth" && year > thisYear) year -= 100;
  const date = new Date(Date.UTC(year, mm - 1, dd));
  if (date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function nameParts(raw: string): { lastName?: string; firstName?: string } {
  const [last, given] = raw.split("<<");
  const tidy = (s?: string) => (s ?? "").replace(/</g, " ").replace(/\s+/g, " ").trim();
  const l = tidy(last);
  const f = tidy(given);
  return { lastName: l || undefined, firstName: f || undefined };
}

export type MrzResult =
  | { ok: true; fields: IdFields; format: "TD1" | "TD2" | "TD3" }
  | { ok: false; reason: string };

/** Cleans lines read from a photo: upper-case, no spaces, common look-alike characters for filler fixed. */
export function cleanMrzLine(line: string): string {
  return line.toUpperCase().replace(/\s+/g, "").replace(/[«‹]/g, "<");
}

function docType(code: string): IdType {
  return code.startsWith("P") ? "passport" : "national_id";
}

/** Reads 2 or 3 lines of a strip. Fails, with a reason, unless every check digit agrees. */
export function parseMrz(rawLines: string[], today = new Date()): MrzResult {
  const lines = rawLines.map(cleanMrzLine).filter(Boolean);
  const len = lines[0]?.length;
  if (!len || lines.some((l) => l.length !== len)) return { ok: false, reason: "The strip lines are different lengths." };

  if (lines.length === 2 && len === 44) {
    const [l1, l2] = lines;
    const number = l2.slice(0, 9);
    const dob = l2.slice(13, 19);
    const exp = l2.slice(21, 27);
    const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43);
    if (!ok(number, l2[9]) || !ok(dob, l2[19]) || !ok(exp, l2[27]) || !ok(composite, l2[43])) {
      return { ok: false, reason: "The strip did not pass its check digits." };
    }
    return build("TD3", l1.slice(0, 2), number, l2.slice(10, 13), dob, exp, l1.slice(5, 44), today);
  }
  if (lines.length === 2 && len === 36) {
    const [l1, l2] = lines;
    const number = l2.slice(0, 9);
    const dob = l2.slice(13, 19);
    const exp = l2.slice(21, 27);
    const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 35);
    if (!ok(number, l2[9]) || !ok(dob, l2[19]) || !ok(exp, l2[27]) || !ok(composite, l2[35])) {
      return { ok: false, reason: "The strip did not pass its check digits." };
    }
    return build("TD2", l1.slice(0, 2), number, l2.slice(10, 13), dob, exp, l1.slice(5, 36), today);
  }
  if (lines.length === 3 && len === 30) {
    const [l1, l2, l3] = lines;
    const number = l1.slice(5, 14);
    const dob = l2.slice(0, 6);
    const exp = l2.slice(8, 14);
    const composite = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
    if (!ok(number, l1[14]) || !ok(dob, l2[6]) || !ok(exp, l2[14]) || !ok(composite, l2[29])) {
      return { ok: false, reason: "The strip did not pass its check digits." };
    }
    return build("TD1", l1.slice(0, 2), number, l2.slice(15, 18), dob, exp, l3, today);
  }
  return { ok: false, reason: "That is not a passport or ID card strip." };
}

function build(
  format: "TD1" | "TD2" | "TD3",
  type: string,
  number: string,
  nat: string,
  dob: string,
  exp: string,
  names: string,
  today: Date,
): MrzResult {
  const birth = mrzDate(dob, "birth", today);
  const expiry = mrzDate(exp, "expiry", today);
  if (!birth || !expiry) return { ok: false, reason: "A date on the strip is not a real date." };
  const { firstName, lastName } = nameParts(names);
  const nationality = iso3ToIso2(nat);
  return {
    ok: true,
    format,
    fields: {
      idType: docType(type),
      idNumber: number.replace(/</g, ""),
      ...(nationality ? { nationality } : {}),
      dateOfBirth: birth,
      idExpiryDate: expiry,
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
    },
  };
}
