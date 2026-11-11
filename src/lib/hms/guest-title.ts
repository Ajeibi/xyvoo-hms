/** Salutations offered on the check-in form. "Other" lets the desk type any title (Prof, Rev, Alhaji…). */
export const GUEST_TITLES = ["Mr", "Mrs", "Miss", "Ms", "Sir", "Dr", "Chief"] as const;

export const GUEST_TITLE_MAX_LENGTH = 40;

/** The known title a stored value matches (case-insensitive), or null for a custom title. */
export function matchKnownGuestTitle(value: string | null | undefined): (typeof GUEST_TITLES)[number] | null {
  const t = value?.trim().toLowerCase();
  if (!t) return null;
  return GUEST_TITLES.find((k) => k.toLowerCase() === t) ?? null;
}

/**
 * What gets saved on the guest. Known titles are normalised to their label ("mr" → "Mr"); any other
 * text is kept as typed. The old placeholder "Other" is not a title, so it saves as nothing.
 */
export function normaliseGuestTitle(value: string | null | undefined): string | null {
  const t = value?.trim().slice(0, GUEST_TITLE_MAX_LENGTH);
  if (!t || t.toLowerCase() === "other") return null;
  return matchKnownGuestTitle(t) ?? t;
}
