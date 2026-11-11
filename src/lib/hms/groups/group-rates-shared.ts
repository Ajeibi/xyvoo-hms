/*
 * Group rate templates: shapes and checks shared by the server and the browser (no server imports).
 */

export type GroupRateTemplate = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  deriveKind: "percent" | "amount";
  deriveValue: number;
  boardBasis: string;
  refundable: boolean;
  prepayRequired: boolean;
  channels: string[];
  sellFrom: string | null;
  sellTo: string | null;
  active: boolean;
  updatedAt: string;
};

export type GroupRateInput = Omit<GroupRateTemplate, "id" | "updatedAt">;

export type HotelPlanView = {
  tenantId: string;
  planId: string;
  code: string;
  name: string;
  isDefault: boolean;
  active: boolean;
  groupTemplateId: string | null;
  deriveKind: string | null;
  deriveValue: number;
  refundable: boolean;
};

export type GroupRatesView = {
  templates: GroupRateTemplate[];
  plansByHotel: Record<string, HotelPlanView[]>;
  /** Hotels whose plans couldn't be read, or where the rates module isn't set up. */
  unreadable: string[];
};

export const RATE_CHANNELS = [
  { key: "front_desk", label: "Front desk" },
  { key: "website", label: "Hotel website" },
  { key: "ota", label: "Booking sites" },
] as const;

/** Checks a template before saving; returns the first problem in words, or null. */
export function validateRateTemplate(t: GroupRateInput): string | null {
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(t.code)) return "Use a short code of letters, numbers, - or _ (up to 24).";
  if (t.name.trim().length < 2 || t.name.trim().length > 80) return "Give the plan a name of 2 to 80 characters.";
  if (!Number.isFinite(t.deriveValue)) return "Enter the change from each hotel's standard rate.";
  if (t.deriveKind === "percent" && (t.deriveValue <= -100 || t.deriveValue > 500)) return "A percentage change must be between -99 and 500.";
  if (t.sellFrom && t.sellTo && t.sellFrom > t.sellTo) return "The sale window ends before it starts.";
  if (!t.channels.length) return "Choose at least one place to sell it.";
  return null;
}
