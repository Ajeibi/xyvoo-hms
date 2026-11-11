/*
 * Deciding which guests at different hotels are the same person. Pure, so it is unit-tested.
 *
 *  - Same email (case and spaces ignored) at two or more hotels: linked, method "email".
 *  - Same phone (last 10 digits) at two or more hotels, when the group allows phone matching: linked,
 *    method "phone". When it doesn't, a same-phone pair whose names also match becomes a suggestion
 *    for a person to confirm.
 *  - An email or phone one hotel has on guests with different names is a placeholder
 *    ("noemail@hotel.com", "08000000000") and never links anyone.
 *  - Guests a hotel kept out of the group, and erased guests, are never linked.
 *  - Existing links are kept; a guest is never moved from one profile to another automatically.
 * A profile is only made when the person is known at two or more hotels.
 */

export type MatchGuest = {
  tenantId: string;
  guestId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
};

export type ExistingLink = { profileId: string; tenantId: string; guestId: string; matchEmail: string | null; matchPhone: string | null };

export type MatchPlan = {
  /** New profiles to make, each with the guests to link to it. */
  newProfiles: Array<{ key: string; displayName: string; matchEmail: string | null; matchPhone: string | null; guests: Array<{ tenantId: string; guestId: string; method: "email" | "phone" }> }>;
  /** Guests to add to profiles that already exist. */
  addToExisting: Array<{ profileId: string; tenantId: string; guestId: string; method: "email" | "phone" }>;
  /** Possible matches for a person to confirm. */
  suggestions: Array<{ profileKey: string; profileId: string | null; tenantId: string; guestId: string; reason: string }>;
};

export function normaliseEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") && e.length > 3 ? e : null;
}

export function normalisePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

function nameKey(g: Pick<MatchGuest, "firstName" | "lastName">) {
  return `${g.firstName} ${g.lastName}`.trim().toLowerCase().replace(/\s+/g, " ");
}

function displayName(g: MatchGuest) {
  return `${g.firstName} ${g.lastName}`.trim() || "Guest";
}

/**
 * Emails or phones that one hotel has on guests with different names: front-desk placeholders such as
 * "noemail@hotel.com" or "08000000000". They say nothing about who the guest is, so they never link.
 */
export function placeholderValues(guests: MatchGuest[], valueOf: (g: MatchGuest) => string | null): Set<string> {
  const names = new Map<string, Set<string>>();
  for (const g of guests) {
    const v = valueOf(g);
    if (!v) continue;
    const key = `${g.tenantId}|${v}`;
    (names.get(key) ?? names.set(key, new Set()).get(key)!).add(nameKey(g));
  }
  const out = new Set<string>();
  for (const [key, set] of names) if (set.size > 1) out.add(key.slice(key.indexOf("|") + 1));
  return out;
}

export function planGuestMatches(guests: MatchGuest[], existing: ExistingLink[], options: { matchByPhone: boolean }): MatchPlan {
  const placeholderEmails = placeholderValues(guests, (g) => normaliseEmail(g.email));
  const placeholderPhones = placeholderValues(guests, (g) => normalisePhone(g.phone));
  const usableEmail = (g: MatchGuest) => {
    const e = normaliseEmail(g.email);
    return e && !placeholderEmails.has(e) ? e : null;
  };
  const usablePhone = (g: MatchGuest) => {
    const p = normalisePhone(g.phone);
    return p && !placeholderPhones.has(p) ? p : null;
  };
  const linkedGuests = new Set(existing.map((l) => l.guestId));
  const profileByEmail = new Map<string, string>();
  const profileByPhone = new Map<string, string>();
  for (const l of existing) {
    if (l.matchEmail) profileByEmail.set(l.matchEmail, l.profileId);
    if (l.matchPhone) profileByPhone.set(l.matchPhone, l.profileId);
  }
  const plan: MatchPlan = { newProfiles: [], addToExisting: [], suggestions: [] };
  const handled = new Set<string>();

  // 1. Email.
  const byEmail = new Map<string, MatchGuest[]>();
  for (const g of guests) {
    const e = usableEmail(g);
    if (!e) continue;
    (byEmail.get(e) ?? byEmail.set(e, []).get(e)!).push(g);
  }
  for (const [email, list] of byEmail) {
    const existingProfile = profileByEmail.get(email);
    const unlinked = list.filter((g) => !linkedGuests.has(g.guestId));
    if (existingProfile) {
      for (const g of unlinked) {
        plan.addToExisting.push({ profileId: existingProfile, tenantId: g.tenantId, guestId: g.guestId, method: "email" });
        handled.add(g.guestId);
      }
      continue;
    }
    const hotels = new Set(list.map((g) => g.tenantId));
    if (hotels.size < 2 || unlinked.length === 0) continue;
    plan.newProfiles.push({
      key: `email:${email}`,
      displayName: displayName(list[0]),
      matchEmail: email,
      matchPhone: usablePhone(list[0]),
      guests: unlinked.map((g) => ({ tenantId: g.tenantId, guestId: g.guestId, method: "email" as const })),
    });
    for (const g of unlinked) handled.add(g.guestId);
  }

  // 2. Phone, for guests email didn't settle.
  const byPhone = new Map<string, MatchGuest[]>();
  for (const g of guests) {
    if (handled.has(g.guestId) || linkedGuests.has(g.guestId)) continue;
    const p = usablePhone(g);
    if (!p) continue;
    (byPhone.get(p) ?? byPhone.set(p, []).get(p)!).push(g);
  }
  for (const [phone, list] of byPhone) {
    const existingProfile = profileByPhone.get(phone);
    const hotels = new Set(list.map((g) => g.tenantId));
    if (!existingProfile && hotels.size < 2) continue;
    if (options.matchByPhone) {
      if (existingProfile) {
        for (const g of list) plan.addToExisting.push({ profileId: existingProfile, tenantId: g.tenantId, guestId: g.guestId, method: "phone" });
      } else {
        plan.newProfiles.push({
          key: `phone:${phone}`,
          displayName: displayName(list[0]),
          matchEmail: null,
          matchPhone: phone,
          guests: list.map((g) => ({ tenantId: g.tenantId, guestId: g.guestId, method: "phone" as const })),
        });
      }
      continue;
    }
    // Phone matching off: only same phone and same name is worth asking about.
    const names = new Set(list.map(nameKey));
    if (names.size !== 1) continue;
    for (const g of list) {
      plan.suggestions.push({ profileKey: existingProfile ?? `phone:${phone}`, profileId: existingProfile ?? null, tenantId: g.tenantId, guestId: g.guestId, reason: "Same name and phone number" });
    }
  }
  return plan;
}
