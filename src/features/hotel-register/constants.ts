import { countries } from "countries-list";

export { LOGO_URL } from "@/constants/branding";
export const COUNTRY_LIST = Object.entries(countries).map(([code, c]) => ({ code, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
export const HOTEL_TYPES = ["Independent Hotel", "Boutique Hotel", "Resort", "Serviced Apartment", "Hotel Chain or Group"];
export const INPUT_CLASS =
  "w-full px-4 py-3 text-sm text-black placeholder:text-slate-500 bg-white border border-slate-300 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-xyvoo-blue focus:border-transparent aria-[invalid=true]:border-rose-500 aria-[invalid=true]:bg-rose-50/20 aria-[invalid=true]:focus:ring-rose-400";

/** The labels the store lists as missing, mapped to the field to focus and what to tell the user. */
export const MISSING_FIELD_INFO: Record<string, { id: string; label: string; message: string }> = {
  "Hotel Name": { id: "hotel-name", label: "Hotel name", message: "Enter your hotel's name." },
  "Hotel Web Address": { id: "hotel-subdomain", label: "Web address", message: "Choose a web address for your hotel." },
  "Hotel Email": { id: "hotel-email", label: "Hotel email", message: "Enter your hotel's email address." },
  "Phone Number": { id: "hotel-phone", label: "Phone number", message: "Enter a phone number we can reach you on." },
  Country: { id: "hotel-country", label: "Country", message: "Choose your country." },
  City: { id: "hotel-city", label: "City", message: "Start typing your city, then choose it from the list." },
  Address: { id: "hotel-address", label: "Hotel address", message: "Enter your hotel's address." },
  "Number of Rooms": { id: "hotel-room-count", label: "Number of rooms", message: "Enter how many rooms your hotel has." },
  "Hotel Type": { id: "hotel-type", label: "Hotel type", message: "Choose your hotel type." },
  "Terms Agreement": { id: "hotel-terms", label: "Terms and privacy agreement", message: "Agree to the terms of service and privacy policy to continue." },
};

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
