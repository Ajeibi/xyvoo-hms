import type { ShopProduct } from "./products";

/*
 * Search, filters, filter counts and sorting for a shop's listing pages, done
 * here over the shop's whole catalogue (shops have up to a few thousand
 * products), so every filter can show how many products it would leave, and
 * collections keep the merchant's own order. No database access: see
 * catalogue-index.ts for where the products come from.
 */

export const LISTING_SORTS = ["relevance", "featured", "newest", "price-asc", "price-desc", "rating"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export type CatalogueQuery = {
  search?: string;
  category?: string;
  brands?: string[];
  tags?: string[];
  /** Option filters, e.g. { Size: ["M", "L"], Colour: ["Black"] }. */
  options?: Record<string, string[]>;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  flag?: "featured" | "new-arrival" | "best-seller" | "on-sale";
  sort: ListingSort;
};

export type FacetValue = { value: string; count: number; selected: boolean };

export type CatalogueFacets = {
  categories: FacetValue[];
  brands: FacetValue[];
  tags: FacetValue[];
  options: Array<{ name: string; values: FacetValue[] }>;
  /** Lowest and highest price among the products the other filters leave. */
  price: { min: number; max: number } | null;
  inStock: number;
};

export type CatalogueResult = {
  products: ShopProduct[];
  total: number;
  facets: CatalogueFacets;
  /** For a search with no results, a spelling that would find something. */
  didYouMean: string | null;
};

/** Too many values make a filter list nobody can use; past this it's left out. */
const MAX_FACET_VALUES = 30;

/** Lower case, accents off ("crème" finds "creme"), punctuation as spaces. */
export function normalise(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const tokens = (text: string) => normalise(text).split(" ").filter(Boolean);

/** Edit distance, with a swap of two letters counting as one ("tshrit" is one away from "tshirt"). */
export function editDistance(a: string, b: string, limit = 3) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > limit) return limit + 1;
  }
  return d[a.length][b.length];
}

/** How many typos a word may have and still match: none for short words, more for long ones. */
const typosAllowed = (word: string) => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0);

type Field = { words: string[]; text: string; weight: number };

function searchFields(p: ShopProduct): Field[] {
  const make = (value: string | null | undefined, weight: number): Field => {
    const text = normalise(value || "");
    return { words: text ? text.split(" ") : [], text, weight };
  };
  return [
    make(p.name, 10),
    make([p.sku, ...p.variants.map((v) => v.sku)].filter(Boolean).join(" "), 8),
    make(p.brand, 6),
    make(p.tags.join(" "), 5),
    make([p.category, p.subcategory].filter(Boolean).join(" "), 4),
    make(p.variants.map((v) => Object.values(v.options).join(" ")).join(" "), 3),
    make([p.shortDescription, p.description].filter(Boolean).join(" "), 1),
  ];
}

/**
 * How well a product matches the search: every word must match a field (as a
 * whole word, the start of one, or with a typo or two), and matches in the
 * name and SKU count most. 0 means no match.
 */
export function matchScore(p: ShopProduct, query: string) {
  const wanted = tokens(query);
  if (!wanted.length) return 0;
  const fields = searchFields(p);
  let score = 0;
  for (const word of wanted) {
    let best = 0;
    for (const field of fields) {
      for (const w of field.words) {
        let s = 0;
        if (w === word) s = 3;
        else if (w.startsWith(word)) s = 2;
        else if (word.length >= 3 && w.includes(word)) s = 1;
        else if (typosAllowed(word) && editDistance(word, w, 2) <= typosAllowed(word)) s = 1;
        if (s) best = Math.max(best, s * field.weight);
      }
    }
    if (!best) return 0;
    score += best;
  }
  // The whole phrase in the name ranks above the words scattered about.
  if (normalise(p.name).includes(normalise(query))) score += 15;
  return score;
}

/** For a search that found nothing: the same words, each swapped for the nearest word in the shop's catalogue. */
export function suggestSpelling(products: ShopProduct[], query: string): string | null {
  const vocabulary = new Set<string>();
  for (const p of products) for (const field of searchFields(p).slice(0, 5)) for (const w of field.words) if (w.length >= 3) vocabulary.add(w);
  let changed = false;
  const fixed = tokens(query).map((word) => {
    if (vocabulary.has(word)) return word;
    let best: string | null = null;
    let bestDistance = 3;
    for (const v of vocabulary) {
      const d = editDistance(word, v, 2);
      if (d < bestDistance) {
        best = v;
        bestDistance = d;
      }
    }
    if (best) changed = true;
    return best ?? word;
  });
  return changed ? fixed.join(" ") : null;
}

const optionPairs = (p: ShopProduct) => {
  const pairs = new Map<string, Set<string>>();
  for (const v of p.variants) for (const [name, value] of Object.entries(v.options)) (pairs.get(name) ?? pairs.set(name, new Set()).get(name)!).add(value);
  return pairs;
};

const sameText = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

type Test = (p: ShopProduct) => boolean;

/** Each filter as its own test, so a filter's counts can leave that filter itself out (pick two brands, see both counts). */
function filterTests(q: CatalogueQuery) {
  const tests: Record<string, Test> = {};
  if (q.category) tests.category = (p) => sameText(p.category, q.category!);
  if (q.brands?.length) tests.brand = (p) => q.brands!.some((b) => sameText(p.brand, b));
  if (q.tags?.length) tests.tag = (p) => q.tags!.some((t) => p.tags.some((pt) => sameText(pt, t)));
  for (const [name, values] of Object.entries(q.options ?? {})) {
    if (!values.length) continue;
    tests[`option:${name}`] = (p) => {
      const have = optionPairs(p).get(name);
      return Boolean(have && values.some((v) => have.has(v)));
    };
  }
  if (q.minPrice != null || q.maxPrice != null) tests.price = (p) => (q.minPrice == null || p.price >= q.minPrice) && (q.maxPrice == null || p.price <= q.maxPrice);
  if (q.inStockOnly) tests.stock = (p) => p.inStock;
  if (q.flag === "featured") tests.flag = (p) => p.featured;
  if (q.flag === "new-arrival") tests.flag = (p) => p.newArrival;
  if (q.flag === "best-seller") tests.flag = (p) => p.bestSeller;
  if (q.flag === "on-sale") tests.flag = (p) => p.compareAtPrice != null && p.compareAtPrice > p.price;
  return tests;
}

const passes = (p: ShopProduct, tests: Record<string, Test>, except?: string) => Object.entries(tests).every(([key, t]) => key === except || t(p));

/** `order`, when given, is the merchant's own order for the values (sizes run XS, S, M, L), used instead of popularity. */
function countValues(products: ShopProduct[], valuesOf: (p: ShopProduct) => string[], selected: string[] = [], order?: string[]): FacetValue[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const p of products) {
    for (const raw of new Set(valuesOf(p).map((v) => v.trim()).filter(Boolean))) {
      const key = raw.toLowerCase();
      const entry = counts.get(key) ?? counts.set(key, { value: raw, count: 0 }).get(key)!;
      entry.count++;
    }
  }
  const chosen = new Set(selected.map((s) => s.toLowerCase()));
  const values = [...counts.values()].map((e) => ({ ...e, selected: chosen.has(e.value.toLowerCase()) }));
  if (order) {
    const at = (v: string) => {
      const i = order.findIndex((o) => o.toLowerCase() === v.toLowerCase());
      return i < 0 ? order.length : i;
    };
    return values.sort((a, b) => at(a.value) - at(b.value) || a.value.localeCompare(b.value));
  }
  return values.sort((a, b) => Number(b.selected) - Number(a.selected) || b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Filters, counts, sorts and pages a catalogue. `positions` is a collection's
 * own order (product id to position), used for "featured" on a collection.
 */
export function queryCatalogue(
  catalogue: ShopProduct[],
  q: CatalogueQuery,
  page: { number: number; size: number },
  positions?: Map<string, number>,
): CatalogueResult {
  const pool = positions ? catalogue.filter((p) => positions.has(p.id)) : catalogue;
  const scores = new Map<string, number>();
  const searched = q.search
    ? pool.filter((p) => {
        const s = matchScore(p, q.search!);
        if (s) scores.set(p.id, s);
        return s > 0;
      })
    : pool;

  const tests = filterTests(q);
  const matching = searched.filter((p) => passes(p, tests));
  const others = (key: string) => searched.filter((p) => passes(p, tests, key));

  // Each option's values in the order merchants list them on their products.
  const optionOrder = new Map<string, string[]>();
  for (const p of searched)
    for (const opt of p.productOptions) {
      const list = optionOrder.get(opt.name) ?? optionOrder.set(opt.name, []).get(opt.name)!;
      for (const v of opt.values) if (!list.includes(v)) list.push(v);
    }
  const optionNames = new Set(optionOrder.keys());
  const priced = others("price");
  const facets: CatalogueFacets = {
    categories: countValues(others("category"), (p) => (p.category ? [p.category] : []), q.category ? [q.category] : []),
    brands: countValues(others("brand"), (p) => (p.brand ? [p.brand] : []), q.brands),
    tags: countValues(others("tag"), (p) => p.tags, q.tags),
    options: [...optionNames]
      .map((name) => ({ name, values: countValues(others(`option:${name}`), (p) => [...(optionPairs(p).get(name) ?? [])], q.options?.[name], optionOrder.get(name)) }))
      .filter((o) => o.values.length > 1 && o.values.length <= MAX_FACET_VALUES),
    price: priced.length ? { min: Math.min(...priced.map((p) => p.price)), max: Math.max(...priced.map((p) => p.price)) } : null,
    inStock: others("stock").filter((p) => p.inStock).length,
  };
  if (facets.brands.length > MAX_FACET_VALUES) facets.brands = facets.brands.filter((b) => b.selected);
  if (facets.tags.length > MAX_FACET_VALUES) facets.tags = facets.tags.filter((t) => t.selected);

  // The catalogue comes newest first, so its own order is "newest".
  const order = new Map(catalogue.map((p, i) => [p.id, i]));
  const newest = (a: ShopProduct, b: ShopProduct) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  const sorters: Record<ListingSort, (a: ShopProduct, b: ShopProduct) => number> = {
    relevance: (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || newest(a, b),
    featured: positions
      ? (a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0)
      : (a, b) => Number(b.featured) - Number(a.featured) || Number(b.bestSeller) - Number(a.bestSeller) || newest(a, b),
    newest,
    "price-asc": (a, b) => a.price - b.price || newest(a, b),
    "price-desc": (a, b) => b.price - a.price || newest(a, b),
    rating: (a, b) => b.ratingAverage - a.ratingAverage || b.ratingCount - a.ratingCount || newest(a, b),
  };
  const sort = q.sort === "relevance" && !q.search ? (positions ? "featured" : "newest") : q.sort;
  const sorted = [...matching].sort(sorters[sort]);
  const start = (page.number - 1) * page.size;

  return {
    products: sorted.slice(start, start + page.size),
    total: sorted.length,
    facets,
    didYouMean: q.search && !searched.length ? suggestSpelling(pool, q.search) : null,
  };
}
