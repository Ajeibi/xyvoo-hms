export type PlatformTenant = {
  id: string;
  hotel_name: string;
  slug: string;
  status: "active" | "pending" | "suspended" | "cancelled";
  plan: string | null;
  room_count: number | null;
  city: string | null;
  country: string | null;
  contact_name: string | null;
  contact_email: string | null;
  brand_primary_color: string | null;
};
