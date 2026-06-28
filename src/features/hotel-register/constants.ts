import { countries } from "countries-list";

export const LOGO_URL = "/images/xyvoo-logo.png";
export const COUNTRY_LIST = Object.entries(countries).map(([code, c]) => ({ code, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
export const HOTEL_TYPES = ["Independent Hotel", "Boutique Hotel", "Resort", "Serviced Apartment", "Hotel Chain or Group"];
export const INPUT_CLASS = "w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl";

export const BILLING_CYCLES = [
  { id: "monthly", label: "Monthly", price: "₦200,000", period: "/mo", effective: "₦2,400,000/yr", saving: null, badge: null, commitment: "None" },
  { id: "quarterly", label: "Quarterly", price: "₦550,000", period: "/qtr", effective: "₦2,200,000/yr", saving: "Save 8%", badge: null, commitment: "3 months" },
  { id: "yearly", label: "Yearly", price: "₦2,000,000", period: "/yr", effective: "₦166,667/mo", saving: "Save 17%", badge: "Best Value", commitment: "12 months" },
] as const;

export const FEATURES = [
  "Front Desk & Check-in/out",
  "Reservations Management",
  "Guest Profiles & History",
  "Room & Housekeeping Tracking",
  "Revenue Analytics Dashboard",
  "Staff Management & PINs",
  "OTA Integration Ready",
  "WhatsApp notifications",
  "F&B / POS Module",
  "Maintenance Work Orders",
  "HR & Scheduling",
  "24/7 Customer Support",
];
