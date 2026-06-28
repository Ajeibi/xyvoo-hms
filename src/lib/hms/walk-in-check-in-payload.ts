import { z } from "zod";

/** Stored on the guest profile when ID type is national ID (no expiry on document; column is NOT NULL). */
export const NATIONAL_ID_ID_EXPIRY_PLACEHOLDER = "9999-12-31";

export const discountScopeSchema = z.enum([
  "none",
  "all_nights",
  "first_night",
  "last_night",
  "first_and_last",
]);

export const guestTitleSchema = z.enum(["mr", "mrs", "ms", "dr", "chief", "other"]);

/** Full identity for adults accompanying the primary guest. */
export const accompanyingAdultGuestSchema = z.object({
  title: guestTitleSchema.optional().nullable(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  phone: z.string().max(40).optional().nullable(),
  email: z.union([z.string().email().max(120), z.literal("")]).optional().nullable(),
  nationality: z.string().length(2),
  idType: z.enum(["passport", "national_id", "drivers_license"]),
  idNumber: z.string().min(2).max(60),
  idExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Children and infants — name, DOB, nationality. */
export const minorGuestSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nationality: z.string().length(2).optional().default("NG"),
});

export const walkInCheckInPayloadSchema = z
  .object({
    slug: z.string().min(1),
    /** Hotel user attributed as having checked the guest in (must be a tenant member). */
    checkedInByUserId: z.string().uuid(),
    title: guestTitleSchema.optional().nullable(),

    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    phone: z.string().min(5).max(40),
    email: z.string().email().max(120),
    nationality: z.string().length(2),
    idType: z.enum(["passport", "national_id", "drivers_license"]),
    idNumber: z.string().min(2).max(60),
    idExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

    arrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    arrivalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),

    adults: z.coerce.number().int().min(1).max(20),
    children: z.coerce.number().int().min(0).max(20).optional().default(0),
    infants: z.coerce.number().int().min(0).max(20).optional().default(0),

    /** Adults 2…N — one entry per additional adult. */
    additionalAdults: z.array(accompanyingAdultGuestSchema).optional().default([]),
    childGuests: z.array(minorGuestSchema).optional().default([]),
    infantGuests: z.array(minorGuestSchema).optional().default([]),

    purposeOfVisit: z.enum(["leisure", "business", "transit"]).default("leisure"),

    roomTypeCode: z.string().min(1).max(40),
    roomCode: z.string().max(20).optional(),

    /** Published BAR for the room type (server recomputes; must match within tolerance). */
    ratePerNightBar: z.coerce.number().min(0),

    discountPercent: z.coerce.number().min(0).max(100).default(0),
    discountScope: discountScopeSchema.default("none"),

    taxExemptVat: z.coerce.boolean().optional().default(false),
    taxExemptServiceCharge: z.coerce.boolean().optional().default(false),
    taxExemptStateLevy: z.coerce.boolean().optional().default(false),
    taxExemptStampLevy: z.coerce.boolean().optional().default(false),
    taxExemptionReason: z.string().max(500).optional().nullable(),
    taxExemptionDocRef: z.string().max(120).optional().nullable(),

    settlementMethod: z
      .enum(["cash", "card", "pos", "split", "direct_bill", "partial_credit"])
      .default("cash"),
    settlementType: z.string().max(80).optional().nullable(),
    cardLast4: z.string().max(4).optional().nullable(),
    cardExpiry: z.string().max(5).optional().nullable(),
    billToAccount: z.string().max(200).optional().nullable(),
    poNumber: z.string().max(80).optional().nullable(),
    preauthAmount: z.coerce.number().min(0).optional().nullable(),

    guestRemarksReservation: z.string().max(2000).optional().nullable(),
    guestRemarksCheckIn: z.string().max(2000).optional().nullable(),
    guestRemarksCheckOut: z.string().max(2000).optional().nullable(),

    guaranteeReleaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    minPaymentPerDayToExtend: z.coerce.number().min(0).optional().nullable(),

    seasonCode: z.string().max(40).optional().nullable(),
    rateType: z.enum(["rack", "corporate", "walk_in_bar", "promotional"]).default("walk_in_bar"),

    marketSegment: z
      .enum(["transient", "corporate", "group", "government", "wholesale"])
      .default("transient"),
    source: z.enum(["walk_in", "phone", "referral", "ota", "website", "travel_agent"]).default("walk_in"),
    bookingChannel: z.string().max(120).optional().nullable(),
    travelAgentName: z.string().max(120).optional().nullable(),
    commissionPlan: z.string().max(120).optional().nullable(),
    commissionValue: z.coerce.number().min(0).optional().nullable(),

    voucherNumber: z.string().max(80).optional().nullable(),
    showRateOnRegistrationCard: z.coerce.boolean().optional().default(true),
    generateBill: z.coerce.boolean().optional().default(true),
    rateOverridden: z.coerce.boolean().optional().default(false),
    rateOverrideReason: z.string().max(500).optional().nullable(),
    immigrationRegistrationRequired: z.coerce.boolean().optional().default(false),

    vipFlag: z.coerce.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const extraAdults = Math.max(0, data.adults - 1);
    const children = data.children ?? 0;
    const infants = data.infants ?? 0;

    if ((data.additionalAdults?.length ?? 0) !== extraAdults) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Enter details for all ${data.adults} adult(s) (${extraAdults} additional).`,
        path: ["additionalAdults"],
      });
    }
    if ((data.childGuests?.length ?? 0) !== children) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Enter details for all ${children} child guest(s).`,
        path: ["childGuests"],
      });
    }
    if ((data.infantGuests?.length ?? 0) !== infants) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Enter details for all ${infants} infant guest(s).`,
        path: ["infantGuests"],
      });
    }

    for (const [i, g] of (data.additionalAdults ?? []).entries()) {
      if (g.idType !== "national_id" && !g.idExpiryDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ID expiry is required for passport and driver's license.",
          path: ["additionalAdults", i, "idExpiryDate"],
        });
      }
    }
  });

export type WalkInCheckInPayload = z.infer<typeof walkInCheckInPayloadSchema>;
export type AccompanyingAdultGuest = z.infer<typeof accompanyingAdultGuestSchema>;
export type MinorGuest = z.infer<typeof minorGuestSchema>;

export function guestTitleFromPayload(title: WalkInCheckInPayload["title"]): string | null {
  if (!title) return null;
  const map: Record<string, string> = {
    mr: "Mr",
    mrs: "Mrs",
    ms: "Ms",
    dr: "Dr",
    chief: "Chief",
    other: "Other",
  };
  return map[title] ?? null;
}

export function resolveGuestIdExpiry(
  idType: "passport" | "national_id" | "drivers_license",
  idExpiryDate: string | null | undefined,
): string {
  if (idType === "national_id") return NATIONAL_ID_ID_EXPIRY_PLACEHOLDER;
  return idExpiryDate?.trim() ?? "";
}
