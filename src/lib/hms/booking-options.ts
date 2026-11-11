import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isBuiltIn,
  optionValueFromLabel,
  type BookingOptionKind,
  type CustomBookingOption,
} from "@/lib/hms/booking-options-shared";

function map(r: Record<string, unknown>): CustomBookingOption {
  return {
    id: r.id as string,
    kind: r.kind as BookingOptionKind,
    value: r.value as string,
    label: r.label as string,
    isActive: Boolean(r.is_active),
  };
}

/** The hotel's own options (all of them, switched-off ones too). Throws if the table is missing. */
export async function listCustomBookingOptions(service: SupabaseClient, tenantId: string): Promise<CustomBookingOption[]> {
  const { data, error } = await service
    .schema("hotel")
    .from("booking_options")
    .select("id,kind,value,label,is_active")
    .eq("tenant_id", tenantId)
    .order("label", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(map);
}

/**
 * Same as above but never throws: a hotel whose table has not been created yet just has no custom options,
 * so reports and boards keep working with the built-ins.
 */
export async function listCustomBookingOptionsSafe(service: SupabaseClient, tenantId: string): Promise<CustomBookingOption[]> {
  try {
    return await listCustomBookingOptions(service, tenantId);
  } catch {
    return [];
  }
}

/** Value to label for the hotel's own options of one kind, for the label helpers. */
export function customLabelMap(custom: CustomBookingOption[], kind: BookingOptionKind): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of custom) if (c.kind === kind) out[c.value] = c.label;
  return out;
}

export async function createCustomBookingOption(
  service: SupabaseClient,
  params: { tenantId: string; kind: BookingOptionKind; label: string },
): Promise<{ row: CustomBookingOption | null; error: string | null }> {
  const label = params.label.trim();
  const value = optionValueFromLabel(label);
  if (!value) return { row: null, error: "Use letters or numbers in the name." };
  if (isBuiltIn(params.kind, value)) return { row: null, error: "That name is already one of the standard choices." };
  const { data, error } = await service
    .schema("hotel")
    .from("booking_options")
    .insert({ tenant_id: params.tenantId, kind: params.kind, value, label })
    .select("id,kind,value,label,is_active")
    .single();
  if (error || !data) {
    return { row: null, error: error?.code === "23505" ? "You already have one with that name." : (error?.message ?? "Could not add it.") };
  }
  return { row: map(data), error: null };
}

/**
 * Whether a value may be saved on a NEW or edited stay: a built-in, or one of the hotel's own that is switched on.
 * A stay that already holds a value can keep it (pass `existing`) even after it is switched off.
 */
export async function assertBookingOptionAllowed(
  service: SupabaseClient,
  tenantId: string,
  kind: BookingOptionKind,
  value: string,
  existing?: string | null,
): Promise<string | null> {
  if (isBuiltIn(kind, value) || (existing && existing === value)) return null;
  const custom = await listCustomBookingOptionsSafe(service, tenantId);
  const found = custom.find((c) => c.kind === kind && c.value === value);
  if (found?.isActive) return null;
  return kind === "source" ? "That booking source isn't available. Pick one from the list." : "That market segment isn't available. Pick one from the list.";
}
