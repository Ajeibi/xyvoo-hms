import { iso3ToIso2, parseMrz } from "./mrz";
import { ID_TYPES, type IdFields, type IdType } from "./types";

/*
 * Whatever a reader says is treated as untrusted text: trimmed, shaped and checked here before staff see it.
 * Nothing in the picture can make this code do anything but fill these seven fields.
 */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function validIsoDate(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? v : null;
}

function idTypeOf(v: unknown): IdType | undefined {
  const s = str(v, 40).toLowerCase().replace(/[\s'-]+/g, "_");
  if ((ID_TYPES as readonly string[]).includes(s)) return s as IdType;
  if (/passport/.test(s)) return "passport";
  if (/driver|licen[cs]e/.test(s)) return "drivers_license";
  if (/national|nin|voter|identity|id_card/.test(s)) return "national_id";
  return undefined;
}

function countryOf(v: unknown): string | undefined {
  const s = str(v, 40).toUpperCase();
  if (/^[A-Z]{2}$/.test(s)) return s;
  if (/^[A-Z]{3}$/.test(s)) return iso3ToIso2(s);
  return undefined;
}

export function normalizeIdFields(raw: Record<string, unknown>, today = new Date()): { fields: IdFields; warnings: string[] } {
  const warnings: string[] = [];
  const fields: IdFields = {};
  const firstName = str(raw.firstName, 80);
  const lastName = str(raw.lastName, 80);
  if (firstName) fields.firstName = firstName;
  if (lastName) fields.lastName = lastName;
  const idType = idTypeOf(raw.idType ?? raw.documentType);
  if (idType) fields.idType = idType;
  const idNumber = str(raw.idNumber, 40).toUpperCase().replace(/[\s]/g, "");
  if (idNumber) fields.idNumber = idNumber;
  const nat = countryOf(raw.nationality);
  if (nat) fields.nationality = nat;

  const dob = validIsoDate(raw.dateOfBirth);
  if (dob) {
    if (new Date(dob).getTime() > today.getTime()) warnings.push("The date of birth is in the future. Check it against the ID.");
    else fields.dateOfBirth = dob;
  } else if (raw.dateOfBirth) warnings.push("The date of birth could not be read clearly.");

  const exp = validIsoDate(raw.idExpiryDate ?? raw.expiryDate);
  if (exp) {
    fields.idExpiryDate = exp;
    if (new Date(`${exp}T23:59:59Z`).getTime() < today.getTime()) warnings.push("This ID has expired.");
  } else if (raw.idExpiryDate ?? raw.expiryDate) warnings.push("The expiry date could not be read clearly.");

  if (!fields.idNumber) warnings.push("No ID number was found. Type it in.");
  return { fields, warnings };
}

/**
 * Joins a reader's guess with the machine-readable strip. A strip that passes every check digit wins
 * over the guess, field by field, because it is arithmetic and not eyesight.
 */
export function reconcileWithMrz(
  guess: { fields: IdFields; warnings: string[] },
  mrzLines: unknown,
  today = new Date(),
): { fields: IdFields; warnings: string[]; verifiedByMrz: boolean } {
  const lines = Array.isArray(mrzLines) ? mrzLines.filter((l): l is string => typeof l === "string") : [];
  if (lines.length < 2) return { ...guess, verifiedByMrz: false };
  const parsed = parseMrz(lines, today);
  if (!parsed.ok) {
    return { fields: guess.fields, warnings: [...guess.warnings, "The machine-readable strip could not be verified, so these details are the reader's best guess. Check them."], verifiedByMrz: false };
  }
  const merged: IdFields = { ...guess.fields, ...parsed.fields };
  const warnings = guess.warnings.filter((w) => !/ID number|date of birth|expiry/.test(w));
  if (merged.idExpiryDate && new Date(`${merged.idExpiryDate}T23:59:59Z`).getTime() < today.getTime() && !warnings.includes("This ID has expired.")) {
    warnings.push("This ID has expired.");
  }
  return { fields: merged, warnings, verifiedByMrz: true };
}
