/** Static demo catalog for the Inventory & Store seed: stores, categories, items. */

export type SeedLocation = {
  key: string;
  name: string;
  locationTypeCode: string;
};

export const SEED_LOCATIONS: SeedLocation[] = [
  { key: "main", name: "Main Store", locationTypeCode: "main_store" },
  { key: "kitchen", name: "Kitchen Store", locationTypeCode: "kitchen_store" },
  { key: "bar", name: "Bar Store", locationTypeCode: "bar_store" },
  { key: "housekeeping", name: "Housekeeping Store", locationTypeCode: "housekeeping_store" },
  { key: "engineering", name: "Engineering Store", locationTypeCode: "engineering_store" },
];

export const SEED_CATEGORIES = [
  "Food & Groceries",
  "Beverages",
  "Kitchen Supplies",
  "Linen",
  "Guest Amenities",
  "Cleaning Supplies",
  "Engineering Spares",
  "Office & Stationery",
] as const;

export type SeedItem = {
  sku: string;
  name: string;
  category: (typeof SEED_CATEGORIES)[number];
  unitCode: string;
  itemTypeCode: string;
  unitCost: number;
  homeLocationKey: string;
  parLevel: number;
  reorderPoint: number;
  reorderQty: number;
  /** Department that normally consumes this item via requisitions. */
  consumingDepartment: "Kitchen" | "Bar" | "Housekeeping" | "Engineering" | "Front Desk";
  perishable?: boolean;
};

export const SEED_ITEMS: SeedItem[] = [
  // Food & Groceries — Kitchen Store — consumed by Kitchen
  { sku: "FD-RICE", name: "Basmati Rice", category: "Food & Groceries", unitCode: "kg", itemTypeCode: "food", unitCost: 1200, homeLocationKey: "kitchen", parLevel: 100, reorderPoint: 30, reorderQty: 50, consumingDepartment: "Kitchen", perishable: false },
  { sku: "FD-CHKN", name: "Chicken Breast", category: "Food & Groceries", unitCode: "kg", itemTypeCode: "food", unitCost: 2500, homeLocationKey: "kitchen", parLevel: 60, reorderPoint: 20, reorderQty: 40, consumingDepartment: "Kitchen", perishable: true },
  { sku: "FD-BEEF", name: "Beef (Diced)", category: "Food & Groceries", unitCode: "kg", itemTypeCode: "food", unitCost: 3200, homeLocationKey: "kitchen", parLevel: 50, reorderPoint: 15, reorderQty: 30, consumingDepartment: "Kitchen", perishable: true },
  { sku: "FD-TOM", name: "Fresh Tomatoes", category: "Food & Groceries", unitCode: "kg", itemTypeCode: "food", unitCost: 800, homeLocationKey: "kitchen", parLevel: 40, reorderPoint: 10, reorderQty: 30, consumingDepartment: "Kitchen", perishable: true },
  { sku: "FD-ONI", name: "Onions", category: "Food & Groceries", unitCode: "kg", itemTypeCode: "food", unitCost: 600, homeLocationKey: "kitchen", parLevel: 40, reorderPoint: 10, reorderQty: 30, consumingDepartment: "Kitchen", perishable: true },
  { sku: "FD-OIL", name: "Cooking Oil (Vegetable)", category: "Food & Groceries", unitCode: "litre", itemTypeCode: "food", unitCost: 1500, homeLocationKey: "kitchen", parLevel: 60, reorderPoint: 15, reorderQty: 30, consumingDepartment: "Kitchen" },
  { sku: "FD-SALT", name: "Salt", category: "Food & Groceries", unitCode: "kg", itemTypeCode: "food", unitCost: 300, homeLocationKey: "kitchen", parLevel: 20, reorderPoint: 5, reorderQty: 15, consumingDepartment: "Kitchen" },
  { sku: "FD-SUGR", name: "Sugar", category: "Food & Groceries", unitCode: "kg", itemTypeCode: "food", unitCost: 700, homeLocationKey: "kitchen", parLevel: 30, reorderPoint: 8, reorderQty: 20, consumingDepartment: "Kitchen" },
  { sku: "FD-FLOR", name: "Flour (Wheat)", category: "Food & Groceries", unitCode: "kg", itemTypeCode: "food", unitCost: 650, homeLocationKey: "kitchen", parLevel: 50, reorderPoint: 15, reorderQty: 30, consumingDepartment: "Kitchen" },
  { sku: "FD-EGGS", name: "Eggs (Carton of 30)", category: "Food & Groceries", unitCode: "carton", itemTypeCode: "food", unitCost: 3000, homeLocationKey: "kitchen", parLevel: 20, reorderPoint: 5, reorderQty: 15, consumingDepartment: "Kitchen", perishable: true },
  { sku: "FD-MILK", name: "Fresh Milk", category: "Food & Groceries", unitCode: "litre", itemTypeCode: "food", unitCost: 900, homeLocationKey: "kitchen", parLevel: 30, reorderPoint: 8, reorderQty: 20, consumingDepartment: "Kitchen", perishable: true },
  { sku: "FD-BUTR", name: "Butter", category: "Food & Groceries", unitCode: "kg", itemTypeCode: "food", unitCost: 4500, homeLocationKey: "kitchen", parLevel: 10, reorderPoint: 3, reorderQty: 8, consumingDepartment: "Kitchen", perishable: true },

  // Beverages — Bar Store — consumed by Bar
  { sku: "BV-HEIN", name: "Heineken Beer (Bottle)", category: "Beverages", unitCode: "bottle", itemTypeCode: "beverage", unitCost: 800, homeLocationKey: "bar", parLevel: 200, reorderPoint: 50, reorderQty: 100, consumingDepartment: "Bar" },
  { sku: "BV-COKE", name: "Coca-Cola (Can)", category: "Beverages", unitCode: "can", itemTypeCode: "beverage", unitCost: 350, homeLocationKey: "bar", parLevel: 300, reorderPoint: 80, reorderQty: 150, consumingDepartment: "Bar" },
  { sku: "BV-RWIN", name: "Red Wine (Bottle)", category: "Beverages", unitCode: "bottle", itemTypeCode: "beverage", unitCost: 8500, homeLocationKey: "bar", parLevel: 40, reorderPoint: 10, reorderQty: 20, consumingDepartment: "Bar" },
  { sku: "BV-VODK", name: "Vodka (Bottle)", category: "Beverages", unitCode: "bottle", itemTypeCode: "beverage", unitCost: 12000, homeLocationKey: "bar", parLevel: 20, reorderPoint: 5, reorderQty: 10, consumingDepartment: "Bar" },
  { sku: "BV-WHIS", name: "Whisky (Bottle)", category: "Beverages", unitCode: "bottle", itemTypeCode: "beverage", unitCost: 18000, homeLocationKey: "bar", parLevel: 15, reorderPoint: 4, reorderQty: 10, consumingDepartment: "Bar" },
  { sku: "BV-TONC", name: "Tonic Water (Can)", category: "Beverages", unitCode: "can", itemTypeCode: "beverage", unitCost: 400, homeLocationKey: "bar", parLevel: 100, reorderPoint: 25, reorderQty: 50, consumingDepartment: "Bar" },
  { sku: "BV-WATR", name: "Bottled Water (50cl)", category: "Beverages", unitCode: "bottle", itemTypeCode: "beverage", unitCost: 250, homeLocationKey: "main", parLevel: 400, reorderPoint: 100, reorderQty: 200, consumingDepartment: "Bar" },
  { sku: "BV-OJ", name: "Orange Juice (Carton)", category: "Beverages", unitCode: "carton", itemTypeCode: "beverage", unitCost: 1800, homeLocationKey: "bar", parLevel: 40, reorderPoint: 10, reorderQty: 20, consumingDepartment: "Bar", perishable: true },

  // Kitchen / restaurant supplies — Kitchen Store — consumed by Kitchen
  { sku: "KS-NAPK", name: "Paper Napkins (Pack)", category: "Kitchen Supplies", unitCode: "pack", itemTypeCode: "consumable", unitCost: 1200, homeLocationKey: "kitchen", parLevel: 60, reorderPoint: 15, reorderQty: 30, consumingDepartment: "Kitchen" },
  { sku: "KS-CUPS", name: "Disposable Cups (Pack of 50)", category: "Kitchen Supplies", unitCode: "pack", itemTypeCode: "consumable", unitCost: 1500, homeLocationKey: "kitchen", parLevel: 40, reorderPoint: 10, reorderQty: 20, consumingDepartment: "Kitchen" },
  { sku: "KS-FOIL", name: "Aluminium Foil Roll", category: "Kitchen Supplies", unitCode: "roll", itemTypeCode: "consumable", unitCost: 2200, homeLocationKey: "kitchen", parLevel: 20, reorderPoint: 5, reorderQty: 15, consumingDepartment: "Kitchen" },
  { sku: "KS-CLNG", name: "Cling Film Roll", category: "Kitchen Supplies", unitCode: "roll", itemTypeCode: "consumable", unitCost: 1800, homeLocationKey: "kitchen", parLevel: 20, reorderPoint: 5, reorderQty: 15, consumingDepartment: "Kitchen" },
  { sku: "KS-TPCK", name: "Toothpicks (Box)", category: "Kitchen Supplies", unitCode: "box", itemTypeCode: "consumable", unitCost: 500, homeLocationKey: "kitchen", parLevel: 15, reorderPoint: 4, reorderQty: 10, consumingDepartment: "Kitchen" },
  { sku: "KS-CTLR", name: "Cutlery Set", category: "Kitchen Supplies", unitCode: "set", itemTypeCode: "operating_equipment", unitCost: 3500, homeLocationKey: "kitchen", parLevel: 100, reorderPoint: 20, reorderQty: 30, consumingDepartment: "Kitchen" },

  // Linen — Housekeeping Store — consumed by Housekeeping
  { sku: "LN-BTOW", name: "Bath Towels", category: "Linen", unitCode: "piece", itemTypeCode: "linen", unitCost: 3500, homeLocationKey: "housekeeping", parLevel: 200, reorderPoint: 50, reorderQty: 100, consumingDepartment: "Housekeeping" },
  { sku: "LN-HTOW", name: "Hand Towels", category: "Linen", unitCode: "piece", itemTypeCode: "linen", unitCost: 1800, homeLocationKey: "housekeeping", parLevel: 200, reorderPoint: 50, reorderQty: 100, consumingDepartment: "Housekeeping" },
  { sku: "LN-BEDS", name: "Bedsheets (Queen)", category: "Linen", unitCode: "piece", itemTypeCode: "linen", unitCost: 6500, homeLocationKey: "housekeeping", parLevel: 150, reorderPoint: 40, reorderQty: 80, consumingDepartment: "Housekeeping" },
  { sku: "LN-PLWC", name: "Pillow Cases", category: "Linen", unitCode: "piece", itemTypeCode: "linen", unitCost: 1500, homeLocationKey: "housekeeping", parLevel: 200, reorderPoint: 50, reorderQty: 100, consumingDepartment: "Housekeeping" },
  { sku: "LN-ROBE", name: "Bathrobes", category: "Linen", unitCode: "piece", itemTypeCode: "linen", unitCost: 8500, homeLocationKey: "housekeeping", parLevel: 60, reorderPoint: 15, reorderQty: 30, consumingDepartment: "Housekeeping" },
  { sku: "LN-DUVT", name: "Duvet Covers", category: "Linen", unitCode: "piece", itemTypeCode: "linen", unitCost: 9500, homeLocationKey: "housekeeping", parLevel: 60, reorderPoint: 15, reorderQty: 30, consumingDepartment: "Housekeeping" },

  // Guest amenities — Housekeeping Store — consumed by Housekeeping
  { sku: "GA-SGEL", name: "Shower Gel (Mini Bottle)", category: "Guest Amenities", unitCode: "bottle", itemTypeCode: "amenity", unitCost: 350, homeLocationKey: "housekeeping", parLevel: 300, reorderPoint: 80, reorderQty: 150, consumingDepartment: "Housekeeping" },
  { sku: "GA-BLOT", name: "Body Lotion (Mini Bottle)", category: "Guest Amenities", unitCode: "bottle", itemTypeCode: "amenity", unitCost: 350, homeLocationKey: "housekeeping", parLevel: 300, reorderPoint: 80, reorderQty: 150, consumingDepartment: "Housekeeping" },
  { sku: "GA-SHMP", name: "Shampoo (Mini Bottle)", category: "Guest Amenities", unitCode: "bottle", itemTypeCode: "amenity", unitCost: 350, homeLocationKey: "housekeeping", parLevel: 300, reorderPoint: 80, reorderQty: 150, consumingDepartment: "Housekeeping" },
  { sku: "GA-SOAP", name: "Bar Soap", category: "Guest Amenities", unitCode: "piece", itemTypeCode: "amenity", unitCost: 250, homeLocationKey: "housekeeping", parLevel: 400, reorderPoint: 100, reorderQty: 200, consumingDepartment: "Housekeeping" },
  { sku: "GA-SLIP", name: "Slippers (Pair)", category: "Guest Amenities", unitCode: "pair", itemTypeCode: "amenity", unitCost: 900, homeLocationKey: "housekeeping", parLevel: 250, reorderPoint: 60, reorderQty: 120, consumingDepartment: "Housekeeping" },
  { sku: "GA-TISS", name: "Toilet Paper Roll", category: "Guest Amenities", unitCode: "roll", itemTypeCode: "amenity", unitCost: 350, homeLocationKey: "housekeeping", parLevel: 500, reorderPoint: 120, reorderQty: 250, consumingDepartment: "Housekeeping" },
  { sku: "GA-DENT", name: "Dental Kit", category: "Guest Amenities", unitCode: "piece", itemTypeCode: "amenity", unitCost: 600, homeLocationKey: "housekeeping", parLevel: 150, reorderPoint: 40, reorderQty: 80, consumingDepartment: "Housekeeping" },

  // Cleaning supplies — Housekeeping Store — consumed by Housekeeping
  { sku: "CL-HSOP", name: "Liquid Hand Soap", category: "Cleaning Supplies", unitCode: "litre", itemTypeCode: "consumable", unitCost: 1500, homeLocationKey: "housekeeping", parLevel: 40, reorderPoint: 10, reorderQty: 20, consumingDepartment: "Housekeeping" },
  { sku: "CL-DETG", name: "Laundry Detergent", category: "Cleaning Supplies", unitCode: "kg", itemTypeCode: "consumable", unitCost: 1200, homeLocationKey: "housekeeping", parLevel: 60, reorderPoint: 15, reorderQty: 30, consumingDepartment: "Housekeeping" },
  { sku: "CL-GLSC", name: "Glass Cleaner Spray", category: "Cleaning Supplies", unitCode: "bottle", itemTypeCode: "consumable", unitCost: 1100, homeLocationKey: "housekeeping", parLevel: 30, reorderPoint: 8, reorderQty: 20, consumingDepartment: "Housekeeping" },
  { sku: "CL-DISF", name: "Floor Disinfectant", category: "Cleaning Supplies", unitCode: "litre", itemTypeCode: "consumable", unitCost: 1400, homeLocationKey: "housekeeping", parLevel: 50, reorderPoint: 12, reorderQty: 25, consumingDepartment: "Housekeeping" },
  { sku: "CL-AIRF", name: "Air Freshener Spray", category: "Cleaning Supplies", unitCode: "can", itemTypeCode: "consumable", unitCost: 1300, homeLocationKey: "housekeeping", parLevel: 40, reorderPoint: 10, reorderQty: 20, consumingDepartment: "Housekeeping" },

  // Engineering spares — Engineering Store — consumed by Engineering
  { sku: "EN-BULB", name: "LED Light Bulb", category: "Engineering Spares", unitCode: "piece", itemTypeCode: "engineering_spare", unitCost: 1200, homeLocationKey: "engineering", parLevel: 100, reorderPoint: 25, reorderQty: 50, consumingDepartment: "Engineering" },
  { sku: "EN-FUSE", name: "Electrical Fuse", category: "Engineering Spares", unitCode: "piece", itemTypeCode: "engineering_spare", unitCost: 300, homeLocationKey: "engineering", parLevel: 60, reorderPoint: 15, reorderQty: 30, consumingDepartment: "Engineering" },
  { sku: "EN-PLCK", name: "Padlock", category: "Engineering Spares", unitCode: "piece", itemTypeCode: "engineering_spare", unitCost: 2500, homeLocationKey: "engineering", parLevel: 30, reorderPoint: 8, reorderQty: 15, consumingDepartment: "Engineering" },
  { sku: "EN-CABL", name: "Extension Cable", category: "Engineering Spares", unitCode: "piece", itemTypeCode: "engineering_spare", unitCost: 3500, homeLocationKey: "engineering", parLevel: 20, reorderPoint: 5, reorderQty: 10, consumingDepartment: "Engineering" },
  { sku: "EN-PANT", name: "Wall Paint (White, Litre)", category: "Engineering Spares", unitCode: "litre", itemTypeCode: "engineering_spare", unitCost: 4500, homeLocationKey: "engineering", parLevel: 30, reorderPoint: 8, reorderQty: 15, consumingDepartment: "Engineering" },
  { sku: "EN-BATT", name: "AA Batteries (Pack)", category: "Engineering Spares", unitCode: "pack", itemTypeCode: "engineering_spare", unitCost: 1500, homeLocationKey: "engineering", parLevel: 40, reorderPoint: 10, reorderQty: 20, consumingDepartment: "Engineering" },
  { sku: "EN-PIPE", name: "Plumbing Pipe Fitting", category: "Engineering Spares", unitCode: "piece", itemTypeCode: "engineering_spare", unitCost: 1800, homeLocationKey: "engineering", parLevel: 25, reorderPoint: 6, reorderQty: 15, consumingDepartment: "Engineering" },

  // Office & stationery — Main Store — consumed by Front Desk
  { sku: "OF-PENS", name: "Ballpoint Pens (Box of 50)", category: "Office & Stationery", unitCode: "box", itemTypeCode: "other", unitCost: 3500, homeLocationKey: "main", parLevel: 10, reorderPoint: 3, reorderQty: 8, consumingDepartment: "Front Desk" },
  { sku: "OF-A4", name: "A4 Paper Ream", category: "Office & Stationery", unitCode: "pack", itemTypeCode: "other", unitCost: 3200, homeLocationKey: "main", parLevel: 20, reorderPoint: 5, reorderQty: 15, consumingDepartment: "Front Desk" },
  { sku: "OF-STPL", name: "Stapler", category: "Office & Stationery", unitCode: "piece", itemTypeCode: "other", unitCost: 2500, homeLocationKey: "main", parLevel: 10, reorderPoint: 3, reorderQty: 8, consumingDepartment: "Front Desk" },
  { sku: "OF-STKN", name: "Sticky Notes Pack", category: "Office & Stationery", unitCode: "pack", itemTypeCode: "other", unitCost: 1200, homeLocationKey: "main", parLevel: 15, reorderPoint: 4, reorderQty: 10, consumingDepartment: "Front Desk" },
  { sku: "OF-INKC", name: "Printer Ink Cartridge", category: "Office & Stationery", unitCode: "piece", itemTypeCode: "other", unitCost: 15000, homeLocationKey: "main", parLevel: 8, reorderPoint: 2, reorderQty: 6, consumingDepartment: "Front Desk" },
  { sku: "OF-RCPT", name: "Receipt Paper Roll", category: "Office & Stationery", unitCode: "roll", itemTypeCode: "other", unitCost: 800, homeLocationKey: "main", parLevel: 30, reorderPoint: 8, reorderQty: 20, consumingDepartment: "Front Desk" },
  { sku: "OF-ENVL", name: "Envelopes (Pack)", category: "Office & Stationery", unitCode: "pack", itemTypeCode: "other", unitCost: 1000, homeLocationKey: "main", parLevel: 15, reorderPoint: 4, reorderQty: 10, consumingDepartment: "Front Desk" },
];
