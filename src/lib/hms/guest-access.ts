import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { hasFullHotelAccess, type HmsSectionKey } from "@/lib/hms/department-access";

/** Who may use the guest screens: the guest section, the front desk and reservations. */
export const GUEST_SECTIONS: HmsSectionKey[] = ["guests", "frontdesk", "reservations"];

/** A signed-in member who can reach guests. */
export async function requireGuestsApi(slug: string) {
  return requireHotelApiSection(slug, GUEST_SECTIONS);
}

/** Add or change a profile, notes and consent: anyone at the desk except Accounts. */
export function canEditGuests(role: string) {
  return getArrivalsCapabilities(role).canEditNotes;
}

/**
 * Merging, erasing, loyalty settings and point adjustments change records for good, so they are
 * for owners, admins and managers (the same people who may mark no-shows or override rooms).
 */
export function canManageGuests(role: string, departmentRole: string | null = null) {
  return hasFullHotelAccess(role, departmentRole) || getArrivalsCapabilities(role).canMarkNoShow;
}
