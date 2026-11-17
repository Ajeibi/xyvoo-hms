/*
 * Staff sign in with a username, not an email. Supabase still needs an email behind every login, so each
 * staff login gets a hidden one that can never receive mail (the .invalid domain is reserved for that).
 * A person types "amaka@grand-hotel" (username@hotel) and the sign-in turns that into the hidden email.
 * A real email contains a dot after the @, a staff identifier never does, so the two can't be confused.
 * Pure and dependency-free: used by the login page, the staff routes and tests.
 */

export const STAFF_EMAIL_SUFFIX = "staff.xyvoo.invalid";

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** Lower-cases and checks a username; null when it isn't allowed (3-32 letters, digits, dot, dash, underscore). */
export function normalizeUsername(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return USERNAME_RE.test(value) ? value : null;
}

/** The part of a hotel's address used in the hidden email and in what staff type at sign-in. */
export function normalizeHotelKey(slug: string): string {
  return slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function staffInternalEmail(username: string, hotelSlug: string): string {
  return `${username}@${normalizeHotelKey(hotelSlug)}.${STAFF_EMAIL_SUFFIX}`;
}

/** What the sign-in form sends to Supabase: a real email as typed, or the hidden email for username@hotel. */
export function signInEmailFor(identifier: string): string {
  const value = identifier.trim();
  const at = value.lastIndexOf("@");
  if (at <= 0) return value;
  const domain = value.slice(at + 1);
  if (domain.includes(".")) return value;
  const username = normalizeUsername(value.slice(0, at));
  const hotel = normalizeHotelKey(domain);
  if (!username || !hotel) return value;
  return staffInternalEmail(username, hotel);
}

/** The username@hotel a person types, from the hidden email; null for a normal email. */
export function staffIdentifierFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = email.toLowerCase().match(/^([^@]+)@([a-z0-9-]+)\.staff\.xyvoo\.invalid$/);
  return match ? `${match[1]}@${match[2]}` : null;
}

export function isInternalStaffEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`.${STAFF_EMAIL_SUFFIX}`));
}
