import { z } from "zod";

/*
 * What a guest profile holds and how it is checked. Safe for the browser and the server.
 * Used by the add-guest form, the edit form and the routes behind them.
 */

export const ID_TYPES = ["passport", "national_id", "drivers_license"] as const;
export const ID_TYPE_LABEL: Record<(typeof ID_TYPES)[number], string> = {
  passport: "Passport",
  national_id: "National ID",
  drivers_license: "Driver's licence",
};
export const GENDERS = ["female", "male", "other", "unspecified"] as const;
export const CONTACT_CHANNELS = ["email", "phone", "whatsapp", "sms"] as const;
export const GUEST_LANGUAGES = ["English", "French", "Arabic", "Hausa", "Yoruba", "Igbo", "Pidgin", "Portuguese", "Chinese", "Other"] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-03-27.");
const text = (max: number) => z.string().trim().max(max);

export const guestFieldsSchema = z.object({
  title: text(20).optional().nullable(),
  firstName: text(80).min(1, "Enter a first name."),
  lastName: text(80).min(1, "Enter a last name."),
  nationality: z.string().trim().length(2, "Use the 2-letter country code, like NG."),
  idType: z.enum(ID_TYPES),
  idNumber: text(60).min(1, "Enter the ID number."),
  idExpiryDate: day,
  dateOfBirth: day,
  gender: z.enum(GENDERS).optional().nullable(),
  phone: text(40).min(5, "Enter a phone number."),
  email: z.string().trim().email("Enter a valid email address.").max(160),
  whatsapp: text(40).optional().nullable(),
  preferredChannel: z.enum(CONTACT_CHANNELS),
  address: text(240).optional().nullable(),
  city: text(80).optional().nullable(),
  country: text(80).optional().nullable(),
  language: text(40).optional().nullable(),
  preferences: text(1000).optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
});

export type GuestFieldsInput = z.infer<typeof guestFieldsSchema>;

export type GuestEditable = {
  title: string;
  firstName: string;
  lastName: string;
  nationality: string;
  idType: (typeof ID_TYPES)[number];
  idNumber: string;
  idExpiryDate: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  whatsapp: string;
  preferredChannel: (typeof CONTACT_CHANNELS)[number];
  address: string;
  city: string;
  country: string;
  language: string;
  preferences: string;
  companyId: string;
};

export const EMPTY_GUEST_EDITABLE: GuestEditable = {
  title: "",
  firstName: "",
  lastName: "",
  nationality: "NG",
  idType: "national_id",
  idNumber: "",
  idExpiryDate: "",
  dateOfBirth: "",
  gender: "unspecified",
  phone: "",
  email: "",
  whatsapp: "",
  preferredChannel: "email",
  address: "",
  city: "",
  country: "",
  language: "",
  preferences: "",
  companyId: "",
};

export type CompanyOption = { id: string; name: string };

/** Letters and digits only, lower case: so "+234 803-123 4567" and "08031234567" can be compared. */
export function phoneKey(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-9) : "";
}

export function emailKey(email: string | null | undefined) {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : "";
}

/** The columns a guest row is saved with. */
export function guestRowFromFields(f: GuestFieldsInput) {
  const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    title: blank(f.title),
    first_name: f.firstName.trim(),
    last_name: f.lastName.trim(),
    nationality: f.nationality.trim().toUpperCase(),
    id_type: f.idType,
    id_number: f.idNumber.trim(),
    id_expiry_date: f.idExpiryDate,
    date_of_birth: f.dateOfBirth,
    gender: f.gender ?? "unspecified",
    phone: f.phone.trim(),
    email: f.email.trim(),
    whatsapp: blank(f.whatsapp),
    preferred_channel: f.preferredChannel,
    address: blank(f.address),
    city: blank(f.city),
    country: blank(f.country),
    language: blank(f.language),
    preferences: blank(f.preferences),
    company_id: f.companyId || null,
  };
}
