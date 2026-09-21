/** Static demo data for the Procurement seed: vendors and the SKUs each one supplies (must exist in the tenant's inventory catalog). */

export type SeedVendor = {
  key: string;
  name: string;
  categoryCode: string;
  contactName: string;
  phone: string;
  email: string;
  country: string;
  currency: string;
  paymentTerms: string;
  leadTimeDays: number;
  status: "active" | "preferred" | "inactive" | "blacklisted";
  certifications: string[];
  notes?: string;
  /** SKU -> agreed unit price in the vendor's own currency, for the price catalog. */
  priceCatalog: Record<string, number>;
};

export const SEED_VENDORS: SeedVendor[] = [
  {
    key: "lagosFresh",
    name: "Lagos Fresh Produce Ltd",
    categoryCode: "food_beverage",
    contactName: "Ngozi Adeyemi",
    phone: "+234 802 100 2201",
    email: "orders@lagosfreshproduce.ng",
    country: "Nigeria",
    currency: "NGN",
    paymentTerms: "Net 15",
    leadTimeDays: 2,
    status: "preferred",
    certifications: ["HACCP certified", "Local sourcing"],
    priceCatalog: { "FD-CHKN": 2450, "FD-TOM": 780, "FD-RICE": 1150, "FD-ONI": 580 },
  },
  {
    key: "metroBev",
    name: "Metro Beverages Distributors",
    categoryCode: "food_beverage",
    contactName: "Chidi Okoro",
    phone: "+234 803 445 7712",
    email: "sales@metrobeverages.ng",
    country: "Nigeria",
    currency: "NGN",
    paymentTerms: "Net 30",
    leadTimeDays: 3,
    status: "preferred",
    certifications: ["NAFDAC registered"],
    priceCatalog: { "BV-HEIN": 780, "BV-COKE": 340, "BV-WATR": 240 },
  },
  {
    key: "comfortLinen",
    name: "ComfortLinen Textiles",
    categoryCode: "linen_amenities",
    contactName: "Aisha Bello",
    phone: "+234 805 220 9930",
    email: "b2b@comfortlinen.ng",
    country: "Nigeria",
    currency: "NGN",
    paymentTerms: "Net 30",
    leadTimeDays: 10,
    status: "active",
    certifications: ["OEKO-TEX Standard 100"],
    priceCatalog: { "LN-BTOW": 3400, "LN-BEDS": 6300, "LN-PLWC": 1450 },
  },
  {
    key: "hotelSupplyNg",
    name: "HotelSupply Nigeria",
    categoryCode: "linen_amenities",
    contactName: "Emeka Nwosu",
    phone: "+234 701 889 4410",
    email: "procurement@hotelsupplyng.com",
    country: "Nigeria",
    currency: "NGN",
    paymentTerms: "Net 15",
    leadTimeDays: 5,
    status: "active",
    certifications: ["ISO 9001"],
    priceCatalog: { "GA-SOAP": 240, "GA-TISS": 340, "GA-SGEL": 340 },
  },
  {
    key: "techFix",
    name: "TechFix Hardware & Spares",
    categoryCode: "engineering_parts",
    contactName: "Tunde Balogun",
    phone: "+234 809 332 1187",
    email: "quotes@techfixhardware.ng",
    country: "Nigeria",
    currency: "NGN",
    paymentTerms: "Net 30",
    leadTimeDays: 4,
    status: "active",
    certifications: [],
    priceCatalog: { "EN-BULB": 1150, "EN-CABL": 3400, "EN-FUSE": 290 },
  },
  {
    key: "cleanPro",
    name: "CleanPro Chemicals",
    categoryCode: "cleaning_supplies",
    contactName: "Grace Effiong",
    phone: "+234 812 004 5561",
    email: "orders@cleanprochemicals.ng",
    country: "Nigeria",
    currency: "NGN",
    paymentTerms: "Net 15",
    leadTimeDays: 6,
    status: "active",
    certifications: ["Environmentally certified"],
    priceCatalog: { "CL-DETG": 1180, "CL-DISF": 1380, "CL-GLSC": 1080 },
  },
  {
    key: "officeMax",
    name: "OfficeMax Nigeria",
    categoryCode: "office_admin",
    contactName: "Femi Adekunle",
    phone: "+234 802 776 3390",
    email: "sales@officemax.ng",
    country: "Nigeria",
    currency: "NGN",
    paymentTerms: "Net 30",
    leadTimeDays: 3,
    status: "inactive",
    certifications: [],
    notes: "No longer restocking after their warehouse relocation — awaiting new price list before reactivating.",
    priceCatalog: { "OF-A4": 3100, "OF-INKC": 14500 },
  },
  {
    key: "globalImports",
    name: "Global Imports (Dubai) FZE",
    categoryCode: "food_beverage",
    contactName: "Farah Al-Sayed",
    phone: "+971 4 221 8890",
    email: "exports@globalimportsfze.ae",
    country: "United Arab Emirates",
    currency: "USD",
    paymentTerms: "50% deposit, balance on shipment",
    leadTimeDays: 21,
    status: "active",
    certifications: ["Halal certified", "ISO 22000"],
    priceCatalog: { "BV-VODK": 24, "BV-WHIS": 34 },
  },
  {
    key: "budgetCleaning",
    name: "Budget Cleaning Co.",
    categoryCode: "cleaning_supplies",
    contactName: "Ibrahim Musa",
    phone: "+234 706 112 8834",
    email: "info@budgetcleaningco.ng",
    country: "Nigeria",
    currency: "NGN",
    paymentTerms: "Cash on delivery",
    leadTimeDays: 5,
    status: "blacklisted",
    certifications: [],
    notes: "Blacklisted after two consecutive deliveries failed quality inspection (diluted product, damaged packaging). Do not place new orders.",
    priceCatalog: {},
  },
];
