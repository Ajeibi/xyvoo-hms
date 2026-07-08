/** Pope John Paul II Catholic Pastoral Centre — menu catalog for HMS seed. */

export type PopeMenuItem = { name: string; price: number; estimated?: boolean };

export type PopeMenuCategory = {
  name: string;
  items: PopeMenuItem[];
  prepMinutes: number;
};

/** Menu 1 — bar (drinks). */
export const POPE_BAR_CATEGORIES: PopeMenuCategory[] = [
  {
    name: "Wine",
    prepMinutes: 2,
    items: [
      { name: "Barrio Grand", price: 30000 },
      { name: "Carlo Rossi", price: 25000 },
      { name: "Drostdy Hof", price: 20000 },
      { name: "Cupido", price: 18000 },
      { name: "Kaiger", price: 20000 },
      { name: "Frontera", price: 20000 },
      { name: "Don Ovidor", price: 20000 },
      { name: "Four Cousins", price: 15000 },
    ],
  },
  {
    name: "Non-Alcoholic Wine",
    prepMinutes: 2,
    items: [
      { name: "Pure Bianski", price: 20000 },
      { name: "Cotswold", price: 8000 },
      { name: "Chairman", price: 15000 },
      { name: "Eva", price: 15000 },
    ],
  },
  {
    name: "Spirits & Gin / Vodka",
    prepMinutes: 2,
    items: [
      { name: "Johnnie Walker Red Label (Big)", price: 65000 },
      { name: "Johnnie Walker Red Label (Small)", price: 35000, estimated: true },
      { name: "Magic Moments", price: 10000 },
      { name: "Night Train Express", price: 8000 },
    ],
  },
  {
    name: "Packet Juice",
    prepMinutes: 1,
    items: [
      { name: "Hollandia (Big)", price: 2000 },
      { name: "Hollandia (Medium)", price: 1000 },
      { name: "5 Alive Exotic (Big)", price: 2500 },
      { name: "5 Alive (Medium)", price: 1500 },
      { name: "Chivita", price: 2000 },
      { name: "Vita B10", price: 2000 },
    ],
  },
  {
    name: "Beer",
    prepMinutes: 1,
    items: [
      { name: "Big Stout", price: 1800 },
      { name: "Medium Stout", price: 1700 },
      { name: "Small Stout", price: 1500 },
      { name: "Guinness Extra Smooth", price: 1500 },
      { name: "Big Orijin", price: 2000 },
      { name: "Heineken", price: 2000 },
      { name: "Hero", price: 1500 },
      { name: "Trophy", price: 1500 },
      { name: "Trophy Stout", price: 1500 },
      { name: "Tiger", price: 1500 },
      { name: "Goldberg", price: 1500 },
      { name: "33 Export", price: 1500 },
      { name: "Star Radler", price: 1500 },
      { name: "Castle Lite", price: 1500 },
      { name: "Legend", price: 1500 },
      { name: "Desperados", price: 1700 },
      { name: "Budweiser", price: 1500 },
    ],
  },
  {
    name: "Alcoholic Can Drinks",
    prepMinutes: 1,
    items: [
      { name: "Smirnoff Ice", price: 1500 },
      { name: "Shot (Can)", price: 1500 },
      { name: "Black Bullet", price: 2000 },
      { name: "Heineken (Can)", price: 1500 },
    ],
  },
  {
    name: "Energy Drinks",
    prepMinutes: 1,
    items: [
      { name: "Red Bull", price: 1500 },
      { name: "Power Horse", price: 1500 },
      { name: "Nutrilex", price: 800 },
    ],
  },
  {
    name: "Soft Drinks (Bottle 35cl)",
    prepMinutes: 1,
    items: [
      { name: "Coke", price: 500 },
      { name: "Amstel Malt", price: 800 },
      { name: "Maltina", price: 800 },
      { name: "Malta Guinness", price: 800 },
      { name: "Fayrouz", price: 500 },
    ],
  },
  {
    name: "Soft Drinks (PET)",
    prepMinutes: 1,
    items: [
      { name: "Coke (50cl)", price: 600 },
      { name: "Fanta (50cl)", price: 600 },
      { name: "Sprite (50cl)", price: 600 },
      { name: "7Up (50cl)", price: 600 },
      { name: "Coke (Small)", price: 500 },
      { name: "Fanta (Small)", price: 500 },
      { name: "Sprite (Small)", price: 500 },
      { name: "Bitter Lemon (Small)", price: 500 },
      { name: "Malta Guinness (Small)", price: 500 },
      { name: "Amstel Malt (Small)", price: 500 },
      { name: "Pepsi", price: 500 },
      { name: "Mirinda", price: 500 },
      { name: "Lucozade Boost", price: 1000 },
      { name: "Amstel Malt (Big)", price: 1000 },
      { name: "Teem", price: 500 },
    ],
  },
  {
    name: "Soft Drinks (Can)",
    prepMinutes: 1,
    items: [
      { name: "Amstel Malt", price: 800 },
      { name: "Malting", price: 800 },
      { name: "Schweppes", price: 500 },
    ],
  },
];

/** Menu 2 — restaurant (food). */
export const POPE_RESTAURANT_CATEGORIES: PopeMenuCategory[] = [
  {
    name: "Breakfast",
    prepMinutes: 15,
    items: [
      { name: "Coffee / Tea / Chocolate", price: 1000 },
      { name: "Toast Bread / Fresh Bread", price: 4000 },
      { name: "Quaker Oats", price: 2000 },
      { name: "Pap / Custard", price: 2000 },
      { name: "Akara", price: 2500 },
      { name: "Moi Moi", price: 2000 },
      { name: "Pancakes", price: 2000 },
      { name: "French Fries", price: 2500 },
      { name: "Indomie", price: 2000 },
      { name: "Boiled / Fried Yam / Potatoes", price: 4000 },
      { name: "Boiled / Fried Plantain", price: 2500 },
      { name: "Boiled Egg", price: 1500 },
      { name: "Spanish Omelette", price: 2500 },
      { name: "Akara / Oats", price: 2000 },
      { name: "Scramble Egg", price: 2000 },
      { name: "Sausage Roll", price: 2000, estimated: true },
    ],
  },
  {
    name: "Lunch / Dinner Swallow",
    prepMinutes: 20,
    items: [
      { name: "Fufu / Semo / Poundo / Wheat / Amala", price: 2500 },
      { name: "Pounded Yam", price: 4000 },
      { name: "Semo / Eba / Wheat", price: 2500 },
    ],
  },
  {
    name: "Soup / Stew / Sauce",
    prepMinutes: 25,
    items: [
      { name: "Afang / Vegetable / White Soup", price: 2500 },
      { name: "Bitterleaf / Ofe Owerri", price: 2500 },
      { name: "Okro / Ogbono / Egusi Soup", price: 2500 },
      { name: "Tomato / Egg Sauce", price: 2500 },
      { name: "Vegetable Sauce", price: 2500 },
    ],
  },
  {
    name: "Rice",
    prepMinutes: 20,
    items: [
      { name: "White Rice", price: 2500 },
      { name: "Jollof Rice", price: 2500 },
      { name: "Fried Rice", price: 2500 },
      { name: "Basmati Rice", price: 3500 },
      { name: "Mixed White Rice & Beans", price: 3000 },
    ],
  },
  {
    name: "Meat / Fish",
    prepMinutes: 25,
    items: [
      { name: "Chicken", price: 3500 },
      { name: "Goat Meat", price: 3000 },
      { name: "Beef", price: 3000 },
      { name: "Ice Fish", price: 3000 },
      { name: "Croaker Fish", price: 3000 },
      { name: "Catfish", price: 3000 },
      { name: "Dry Fish", price: 3000 },
    ],
  },
  {
    name: "Local Favourites",
    prepMinutes: 25,
    items: [
      { name: "Potato Casserole", price: 2500 },
      { name: "Plain / Jollof Spaghetti", price: 2500 },
      { name: "Plantain Porridge", price: 2500 },
      { name: "Farmhouse Porridge", price: 2500 },
      { name: "Beans Porridge", price: 2500 },
      { name: "Yam Porridge", price: 2500 },
      { name: "Boiled Beans", price: 2500 },
    ],
  },
  {
    name: "Pepper Soup / Peppered Meat & Fish",
    prepMinutes: 30,
    items: [
      { name: "Catfish", price: 4000 },
      { name: "Croaker Fish", price: 4000 },
      { name: "Goat Meat", price: 4000 },
      { name: "Chicken", price: 4000 },
      { name: "Dry Fish", price: 4000 },
      { name: "Isi Ewu", price: 5000 },
    ],
  },
  {
    name: "Salad",
    prepMinutes: 8,
    items: [
      { name: "Mixed Vegetable Salad", price: 2500 },
      { name: "Greek Salad", price: 3000 },
      { name: "Chicken Salad", price: 3000 },
    ],
  },
  {
    name: "Snacks and Pastries",
    prepMinutes: 12,
    items: [
      { name: "Meat Pie", price: 1000 },
      { name: "Chicken Pie", price: 1200 },
      { name: "Vegetable Pie", price: 1000 },
      { name: "Fish Roll", price: 1000 },
      { name: "Sausage Roll", price: 800 },
      { name: "Spring Roll", price: 800 },
      { name: "Scotch Egg", price: 1000 },
      { name: "Egg Roll", price: 800 },
      { name: "Buns", price: 500 },
      { name: "Puff Puff", price: 500 },
      { name: "Small Chops", price: 3000 },
      { name: "Sandwich", price: 2000 },
      { name: "Doughnut", price: 500 },
      { name: "Cupcake", price: 800 },
      { name: "Grilled Chicken", price: 4000 },
      { name: "Large Bread", price: 2000 },
      { name: "Digest Bread", price: 2500 },
      { name: "Big Bread", price: 2500 },
      { name: "Sliced Bread", price: 1500 },
      { name: "Cake (Big)", price: 8000 },
      { name: "Cake (Small)", price: 4000 },
      { name: "Full Cake", price: 15000 },
      { name: "Birthday Cake", price: 20000 },
      { name: "Wedding Cake", price: 50000 },
      { name: "Assorted Cakes", price: 3000 },
      { name: "Mixed Small Chops", price: 10000 },
    ],
  },
];

export const POPE_MENU_IDS = {
  outletBar: "e10000d1-0000-4000-8000-000000000001",
  outletRestaurant: "e10000d1-0000-4000-8000-000000000002",
  stationGrill: "e10000d1-0000-4000-8000-000000000011",
  stationCold: "e10000d1-0000-4000-8000-000000000012",
  stationBar: "e10000d1-0000-4000-8000-000000000013",
} as const;

function popeCategoryId(outletIndex: 1 | 2, categoryIndex: number) {
  return `e10000d1-0000-4000-8000-${String(outletIndex * 100 + categoryIndex).padStart(12, "0")}`;
}

function popeItemId(outletIndex: 1 | 2, itemIndex: number) {
  return `e10000d1-0000-4000-8000-${String(10000 + outletIndex * 5000 + itemIndex).padStart(12, "0")}`;
}

function stationForCategory(categoryName: string, outlet: "bar" | "restaurant") {
  if (outlet === "bar") return POPE_MENU_IDS.stationBar;
  if (categoryName === "Salad" || categoryName === "Breakfast") return POPE_MENU_IDS.stationCold;
  return POPE_MENU_IDS.stationGrill;
}

export function buildPopeMenuPayload(tenantId: string) {
  const now = new Date().toISOString();

  const outlets = [
    {
      id: POPE_MENU_IDS.outletBar,
      tenant_id: tenantId,
      code: "menu_1",
      name: "Menu 1",
      outlet_type: "bar",
      is_active: true,
      created_at: now,
    },
    {
      id: POPE_MENU_IDS.outletRestaurant,
      tenant_id: tenantId,
      code: "menu_2",
      name: "Menu 2",
      outlet_type: "restaurant",
      is_active: true,
      created_at: now,
    },
  ];

  const stations = [
    {
      id: POPE_MENU_IDS.stationGrill,
      tenant_id: tenantId,
      code: "grill",
      name: "Grill",
      sort_order: 0,
      is_active: true,
    },
    {
      id: POPE_MENU_IDS.stationCold,
      tenant_id: tenantId,
      code: "cold",
      name: "Cold prep",
      sort_order: 1,
      is_active: true,
    },
    {
      id: POPE_MENU_IDS.stationBar,
      tenant_id: tenantId,
      code: "bar",
      name: "Bar",
      sort_order: 2,
      is_active: true,
    },
  ];

  const categories: Record<string, unknown>[] = [];
  const menuItems: Record<string, unknown>[] = [];

  let barItemIdx = 0;
  POPE_BAR_CATEGORIES.forEach((cat, catIdx) => {
    const catId = popeCategoryId(1, catIdx);
    categories.push({
      id: catId,
      tenant_id: tenantId,
      outlet_id: POPE_MENU_IDS.outletBar,
      name: cat.name,
      sort_order: catIdx,
      is_active: true,
      prep_minutes: cat.prepMinutes,
      created_at: now,
    });
    cat.items.forEach((item, sortOrder) => {
      menuItems.push({
        id: popeItemId(1, barItemIdx),
        tenant_id: tenantId,
        outlet_id: POPE_MENU_IDS.outletBar,
        category_id: catId,
        station_id: stationForCategory(cat.name, "bar"),
        name: item.name,
        description: item.estimated ? "Price estimated — verify against printed menu." : null,
        price: item.price,
        is_available: true,
        eighty_sixed_at: null,
        eighty_sixed_by: null,
        sort_order: sortOrder,
        created_at: now,
        updated_at: now,
      });
      barItemIdx += 1;
    });
  });

  let restItemIdx = 0;
  POPE_RESTAURANT_CATEGORIES.forEach((cat, catIdx) => {
    const catId = popeCategoryId(2, catIdx);
    categories.push({
      id: catId,
      tenant_id: tenantId,
      outlet_id: POPE_MENU_IDS.outletRestaurant,
      name: cat.name,
      sort_order: catIdx,
      is_active: true,
      prep_minutes: cat.prepMinutes,
      created_at: now,
    });
    cat.items.forEach((item, sortOrder) => {
      menuItems.push({
        id: popeItemId(2, restItemIdx),
        tenant_id: tenantId,
        outlet_id: POPE_MENU_IDS.outletRestaurant,
        category_id: catId,
        station_id: stationForCategory(cat.name, "restaurant"),
        name: item.name,
        description: item.estimated ? "Price estimated — verify against printed menu." : null,
        price: item.price,
        is_available: true,
        eighty_sixed_at: null,
        eighty_sixed_by: null,
        sort_order: sortOrder,
        created_at: now,
        updated_at: now,
      });
      restItemIdx += 1;
    });
  });

  const tables = Array.from({ length: 8 }, (_, i) => ({
    id: `e10000d1-0000-4000-8000-${String(20000 + i).padStart(12, "0")}`,
    tenant_id: tenantId,
    outlet_id: POPE_MENU_IDS.outletRestaurant,
    table_code: `T${i + 1}`,
    covers: 2 + (i % 4),
    status: "available",
    created_at: now,
  }));

  return {
    outlets,
    stations,
    categories,
    menuItems,
    tables,
    tenantFbSettings: {
      tenant_id: tenantId,
      kitchen_overdue_minutes: 15,
      updated_at: now,
    },
    counts: {
      barItems: barItemIdx,
      restaurantItems: restItemIdx,
      categories: categories.length,
    },
  };
}
