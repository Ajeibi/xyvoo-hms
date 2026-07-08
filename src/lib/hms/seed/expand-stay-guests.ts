import { NATIONAL_ID_ID_EXPIRY_PLACEHOLDER } from "@/lib/hms/walk-in-check-in-payload";
import type { GuestProfileSample, StaySample } from "./samples/guest-stays-sample.types";

export type ResolvedStayGuest = {
  guestKey: number;
  profile: GuestProfileSample;
  isPrimary: boolean;
  relationship: string;
};

const ADULT_FIRST_NAMES = [
  "Chinedu",
  "Ngozi",
  "Emeka",
  "Fatima",
  "Ibrahim",
  "Grace",
  "Kwame",
  "Amina",
  "Peter",
  "Zara",
  "Helen",
  "David",
  "Sofia",
  "Omar",
  "Catherine",
];

function isChildRelationship(rel?: string | null): boolean {
  const r = (rel ?? "").toLowerCase();
  return r === "child" || r === "infant";
}

function companionRelationship(rel?: string | null): string {
  if (!rel) return "adult";
  const r = rel.toLowerCase();
  if (r === "primary") return "primary";
  if (r === "child" || r === "infant") return r;
  return rel;
}

function dateOfBirthFromAge(age: number, now = new Date()): string {
  const year = now.getUTCFullYear() - Math.max(0, Math.min(17, age));
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function adultDateOfBirth(stayKey: number, index: number): string {
  const year = 1975 + ((stayKey + index * 7) % 28);
  const month = String(((stayKey + index) % 12) + 1).padStart(2, "0");
  const day = String(((stayKey * 3 + index) % 28) + 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function synthesizeAdultCompanion(
  primary: GuestProfileSample,
  stayKey: number,
  index: number,
): GuestProfileSample {
  const firstName = ADULT_FIRST_NAMES[(stayKey + index) % ADULT_FIRST_NAMES.length];
  return {
    title: index % 2 === 0 ? "Mr" : "Mrs",
    first_name: firstName,
    last_name: primary.last_name,
    nationality: primary.nationality,
    id_type: "national_id",
    id_number: `NG-SEED-${stayKey}-A${index + 1}`,
    id_expiry_date: NATIONAL_ID_ID_EXPIRY_PLACEHOLDER,
    date_of_birth: adultDateOfBirth(stayKey, index),
    gender: index % 2 === 0 ? "male" : "female",
    phone: primary.phone,
    email: primary.email.replace("@", `+a${index + 1}@`),
    whatsapp: primary.whatsapp ?? null,
    preferred_channel: primary.preferred_channel ?? "phone",
    tags: [],
  };
}

function synthesizeChildGuest(
  primary: GuestProfileSample,
  age: number,
  stayKey: number,
  index: number,
): GuestProfileSample {
  const suffix = String(stayKey * 10 + index).padStart(4, "0");
  return {
    title: null,
    first_name: index % 2 === 0 ? "Ada" : "Kemi",
    last_name: primary.last_name,
    nationality: primary.nationality,
    id_type: "national_id",
    id_number: `CHILD-${suffix}`,
    id_expiry_date: NATIONAL_ID_ID_EXPIRY_PLACEHOLDER,
    date_of_birth: dateOfBirthFromAge(age),
    gender: index % 2 === 0 ? "female" : "male",
    phone: primary.phone,
    email: primary.email,
    preferred_channel: primary.preferred_channel ?? "phone",
    tags: [],
  };
}

/** Mirrors walk-in check-in: primary + (adults-1) adult profiles + one profile per child. */
export function resolveStayGuests(
  stay: StaySample,
  stayKey: number,
  adults: number,
  children: { age: number }[],
): ResolvedStayGuest[] {
  const primary = stay.primary_guest;
  const links: ResolvedStayGuest[] = [
    {
      guestKey: stayKey * 10,
      profile: primary,
      isPrimary: true,
      relationship: "primary",
    },
  ];

  const explicit = stay.companions ?? [];
  const adultCompanions = explicit.filter((c) => !isChildRelationship(c.relationship));
  const childCompanions = explicit.filter((c) => isChildRelationship(c.relationship));

  let slot = 1;

  for (const comp of adultCompanions) {
    links.push({
      guestKey: stayKey * 10 + slot,
      profile: comp.guest,
      isPrimary: false,
      relationship: companionRelationship(comp.relationship),
    });
    slot += 1;
  }

  const neededAdults = Math.max(0, adults - 1);
  for (let i = adultCompanions.length; i < neededAdults; i += 1) {
    links.push({
      guestKey: stayKey * 10 + slot,
      profile: synthesizeAdultCompanion(primary, stayKey, i),
      isPrimary: false,
      relationship: "adult",
    });
    slot += 1;
  }

  for (let i = 0; i < children.length; i += 1) {
    const age = children[i]?.age ?? 8;
    const explicitChild = childCompanions[i];
    links.push({
      guestKey: stayKey * 10 + slot,
      profile: explicitChild?.guest ?? synthesizeChildGuest(primary, age, stayKey, i),
      isPrimary: false,
      relationship: "child",
    });
    slot += 1;
  }

  return links;
}

/** Same shape as walk-in `buildChildrenJson`, with ages preserved when known. */
export function buildStayChildrenJson(children: { age: number }[]): { type: "child"; age?: number }[] {
  return children.map((c) => ({
    type: "child" as const,
    ...(Number.isFinite(c.age) ? { age: c.age } : {}),
  }));
}
