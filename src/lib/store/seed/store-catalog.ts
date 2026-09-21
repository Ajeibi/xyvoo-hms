export type StoreCatalogProduct = {
  name: string;
  description: string;
  price: number;
  costPrice: number;
  sku: string;
  category: string;
  brand: string;
  stock: number;
  reorderLevel: number;
  tags: string[];
};

export const STORE_DEMO_CURRENCY = "NGN";

export const STORE_CATALOG_PRODUCTS: StoreCatalogProduct[] = [
  {
    name: "Wireless Over-Ear Headphones",
    description: "Noise-isolating over-ear headphones with 30-hour battery life.",
    price: 45000,
    costPrice: 27000,
    sku: "AUD-HP-001",
    category: "Electronics",
    brand: "Aurin",
    stock: 42,
    reorderLevel: 10,
    tags: ["audio", "wireless"],
  },
  {
    name: "Stainless Steel Water Bottle 1L",
    description: "Insulated bottle that keeps drinks cold for 24 hours.",
    price: 8500,
    costPrice: 4200,
    sku: "HOM-WB-014",
    category: "Home & Living",
    brand: "Terra",
    stock: 120,
    reorderLevel: 25,
    tags: ["kitchen", "eco"],
  },
  {
    name: "Men's Slim Fit Oxford Shirt",
    description: "Breathable cotton-blend shirt, tailored fit.",
    price: 15000,
    costPrice: 7000,
    sku: "APP-SH-102",
    category: "Fashion",
    brand: "Kaine & Co",
    stock: 8,
    reorderLevel: 12,
    tags: ["menswear", "shirts"],
  },
  {
    name: "Ceramic Non-Stick Frying Pan 28cm",
    description: "PFOA-free ceramic coating, induction compatible.",
    price: 21000,
    costPrice: 11500,
    sku: "HOM-CK-027",
    category: "Home & Living",
    brand: "Terra",
    stock: 30,
    reorderLevel: 8,
    tags: ["cookware"],
  },
  {
    name: "Bluetooth Portable Speaker",
    description: "Compact IPX6 waterproof speaker with 12-hour playtime.",
    price: 32000,
    costPrice: 18000,
    sku: "AUD-SP-045",
    category: "Electronics",
    brand: "Aurin",
    stock: 0,
    reorderLevel: 10,
    tags: ["audio", "portable"],
  },
  {
    name: "Women's Leather Tote Bag",
    description: "Full-grain leather tote with interior zip pocket.",
    price: 38000,
    costPrice: 19000,
    sku: "APP-BG-063",
    category: "Fashion",
    brand: "Kaine & Co",
    stock: 16,
    reorderLevel: 6,
    tags: ["bags", "leather"],
  },
  {
    name: "Aromatherapy Diffuser",
    description: "Ultrasonic diffuser with 7-colour ambient light.",
    price: 12500,
    costPrice: 6000,
    sku: "HOM-WL-018",
    category: "Home & Living",
    brand: "Terra",
    stock: 54,
    reorderLevel: 15,
    tags: ["wellness"],
  },
  {
    name: "Smartwatch Fitness Tracker",
    description: "Heart-rate, sleep tracking, and 7-day battery life.",
    price: 55000,
    costPrice: 32000,
    sku: "AUD-WT-071",
    category: "Electronics",
    brand: "Aurin",
    stock: 5,
    reorderLevel: 8,
    tags: ["wearables"],
  },
];
