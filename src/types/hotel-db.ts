/** `hotel.memberships` row shape used in auth redirects */
export type HotelMembershipRow = {
  tenant_id: string;
  role?: string | null;
};

export type HotelDashboardTourStatus = "pending" | "skipped" | "completed";

/** Common `tenants` columns for hotel product */
export type HotelTenantCore = {
  id: string;
  subdomain: string | null;
  name: string | null;
};

/** `getHotelTenantBySlug` select */
export type HotelTenantBySlugRow = HotelTenantCore & {
  display_name: string | null;
  logo_url: string | null;
  room_types: unknown;
  pricing_setup: unknown;
  /** JSON array: [{ "floor": number, "room_count": number }, ...] */
  floor_plan: unknown;
  /** When true, HMS dashboard tour is off for every user (tenant-wide "Never show again"). */
  hms_dashboard_tour_hidden?: boolean | null;
  paystack_setup?: unknown;
};

/** Platform tenant listing select (no logo in query) */
export type HotelTenantListRow = HotelTenantCore & {
  display_name: string | null;
};

/** `hotel.profiles` — room count only */
export type HotelProfileRoomCountRow = {
  room_count: number | null;
};

/** `hotel.profiles` — tour completion status for the signed-in user */
export type HotelProfileTourStatusRow = {
  dashboard_tour_status: HotelDashboardTourStatus | null;
};

/** `hotel.profiles` — platform directory join */
export type HotelProfileDirectoryRow = {
  tenant_id: string;
  contact_name: string | null;
  city: string | null;
  country: string | null;
  room_count: number | null;
  trial_ends_at: string | null;
};

/** `hotel.registration_sessions` — latest session per tenant */
export type HotelRegistrationSessionRow = {
  tenant_id: string;
  contact_email: string | null;
  metadata: { billing_plan?: string } | null;
  created_at: string;
};
