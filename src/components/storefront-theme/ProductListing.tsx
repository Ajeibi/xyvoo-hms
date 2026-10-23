import Link from "next/link";
import { notFound } from "next/navigation";
import { LISTING_SORTS, queryCatalogue, type CatalogueFacets, type ListingSort } from "@/lib/shop/catalogue-filter";
import { getCollectionPositions, getShopCatalogue } from "@/lib/shop/catalogue-index";
import { formatShopCurrency } from "@/lib/shop/format";
import { getShopT } from "@/lib/store/i18n/server";
import type { Translator } from "@/lib/store/i18n/translate";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import type { Storefront } from "@/lib/store/site/storefront";
import FiltersPanel from "./FiltersPanel";
import { ProductGridList } from "./ProductCard";
import SortSelect from "./SortSelect";
import { Breadcrumb, Icon } from "./primitives";

const PAGE_SIZE = 24;

/** The listing's address bar: what Next hands a page as searchParams. */
export type ListingQuery = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const many = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : v ? [v] : [])
    .map((s) => s.trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, 20);
const price = (v: string | string[] | undefined) => {
  const n = Number.parseFloat(one(v) ?? "");
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * Reads a listing's address: search, category, filters (brand, tag, option as
 * "Name:Value", min and max price, in stock), sort and page. `defaultSort` is
 * the listing's own order: featured for the shop and collections.
 */
export function parseListingQuery(query: ListingQuery, defaultSort: ListingSort = "featured") {
  const search = one(query.search)?.slice(0, 100);
  const asked = one(query.sort);
  const fallback: ListingSort = search ? "relevance" : defaultSort;
  const sort = (LISTING_SORTS as readonly string[]).includes(asked ?? "") ? (asked as ListingSort) : fallback;
  const options: Record<string, string[]> = {};
  for (const pair of many(query.opt)) {
    const at = pair.indexOf(":");
    if (at > 0) (options[pair.slice(0, at)] ??= []).push(pair.slice(at + 1));
  }
  const parsed = {
    search,
    category: one(query.category)?.slice(0, 100),
    brands: many(query.brand),
    tags: many(query.tag),
    options,
    minPrice: price(query.min),
    maxPrice: price(query.max),
    inStockOnly: one(query.stock) === "in",
    sort,
    defaultSort: fallback,
    page: Math.min(10_000, Math.max(1, Number.parseInt(one(query.page) ?? "1", 10) || 1)),
  };
  return { ...parsed, filtered: hasFilters(parsed) };
}

type ParsedListing = ReturnType<typeof parseListingQuery>;

type ListingFilters = { brands: string[]; tags: string[]; options: Record<string, string[]>; minPrice?: number; maxPrice?: number; inStockOnly: boolean };

const hasFilters = (q: ListingFilters) =>
  q.brands.length > 0 || q.tags.length > 0 || Object.keys(q.options).length > 0 || q.minPrice != null || q.maxPrice != null || q.inStockOnly;

/**
 * Canonical address of a listing page: page 2 onwards points at itself, so
 * search engines keep the products found only on deeper pages.
 */
export function listingCanonical(path: string, page: number) {
  return page > 1 ? `${path}${path.includes("?") ? "&" : "?"}page=${page}` : path;
}

/** Search results, filtered and re-sorted copies of a listing shouldn't compete with it in search engines. */
export function listingRobots(query: ParsedListing, extraNoindex = false) {
  return query.search || query.filtered || query.sort !== query.defaultSort || extraNoindex ? { index: false, follow: true } : undefined;
}

/** The address bar for a listing, keeping everything but what's changed. */
function queryString(q: ParsedListing, change: Partial<Record<"category" | "search" | "sort" | "page" | "min" | "max" | "stock", string | undefined>> & { brand?: string[]; tag?: string[]; opt?: string[] } = {}) {
  const params = new URLSearchParams();
  const set = (key: string, value: string | undefined) => value && params.set(key, value);
  set("search", "search" in change ? change.search : q.search);
  set("category", "category" in change ? change.category : q.category);
  for (const b of change.brand ?? q.brands) params.append("brand", b);
  for (const t of change.tag ?? q.tags) params.append("tag", t);
  for (const o of change.opt ?? Object.entries(q.options).flatMap(([name, values]) => values.map((v) => `${name}:${v}`))) params.append("opt", o);
  set("min", "min" in change ? change.min : q.minPrice?.toString());
  set("max", "max" in change ? change.max : q.maxPrice?.toString());
  set("stock", "stock" in change ? change.stock : q.inStockOnly ? "in" : undefined);
  const sort = "sort" in change ? change.sort : q.sort;
  set("sort", sort !== q.defaultSort ? sort : undefined);
  set("page", change.page);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Page links with gaps: first, last, and two either side of the current page. */
function pageNumbers(current: number, count: number): Array<number | "gap"> {
  const wanted = new Set([1, count, current - 2, current - 1, current, current + 1, current + 2].filter((n) => n >= 1 && n <= count));
  const sorted = [...wanted].sort((a, b) => a - b);
  return sorted.flatMap((n, i) => (i > 0 && n - sorted[i - 1] > 1 ? (["gap", n] as const) : ([n] as const)));
}

/** "Size: M", "Brand: Acme", "Under ₦20,000": the filters in use, each with a link that removes it. */
function appliedFilters(q: ParsedListing, money: (n: number) => string, t: Translator) {
  const pills: Array<{ label: string; href: string }> = [];
  for (const b of q.brands) pills.push({ label: b, href: queryString(q, { brand: q.brands.filter((x) => x !== b) }) });
  for (const t of q.tags) pills.push({ label: t, href: queryString(q, { tag: q.tags.filter((x) => x !== t) }) });
  const pairs = Object.entries(q.options).flatMap(([name, values]) => values.map((v) => `${name}:${v}`));
  for (const pair of pairs) pills.push({ label: pair.replace(":", ": "), href: queryString(q, { opt: pairs.filter((x) => x !== pair) }) });
  if (q.minPrice != null || q.maxPrice != null) {
    const label =
      q.minPrice != null && q.maxPrice != null
        ? t("listing.priceRange", { min: money(q.minPrice), max: money(q.maxPrice) })
        : q.minPrice != null
          ? t("listing.priceFrom", { min: money(q.minPrice) })
          : t("listing.priceUpTo", { max: money(q.maxPrice!) });
    pills.push({ label, href: queryString(q, { min: undefined, max: undefined }) });
  }
  if (q.inStockOnly) pills.push({ label: t("listing.inStock"), href: queryString(q, { stock: undefined }) });
  return pills;
}

/** Product grid page with search, filters, category chips, sort and pagination, used by "all products" and collection pages. */
export default async function ProductListing({
  storefront,
  title,
  lead,
  listingPath,
  query,
  collectionId,
  showCategories = true,
}: {
  storefront: Storefront;
  title: string;
  lead?: string;
  /** Store-relative path of this listing, for chips, sort and pagination links. */
  listingPath: string;
  query: ParsedListing;
  collectionId?: string;
  showCategories?: boolean;
}) {
  const { basePath, site, profile } = storefront;
  const [catalogue, positions] = await Promise.all([getShopCatalogue(storefront.tenant.id), collectionId ? getCollectionPositions(collectionId) : undefined]);
  const { products, total, facets, didYouMean } = queryCatalogue(
    catalogue,
    {
      search: query.search,
      category: showCategories ? query.category : undefined,
      brands: query.brands,
      tags: query.tags,
      options: query.options,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      inStockOnly: query.inStockOnly,
      sort: query.sort,
    },
    { number: query.page, size: PAGE_SIZE },
    positions,
  );

  const action = storeHref(basePath, listingPath);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // A page past the last one (an old link, or a typed ?page=) doesn't exist.
  if (query.page > pageCount) notFound();
  const href = (change: Parameters<typeof queryString>[1] = {}) => `${action}${queryString(query, change)}`;
  const first = total === 0 ? 0 : (query.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, query.page * PAGE_SIZE);
  const t = getShopT(storefront);
  const heading = query.search ? t("listing.resultsFor", { search: query.search }) : query.category ? query.category : title;
  const money = (n: number) => formatShopCurrency(n, profile.currencyCode);
  const pills = appliedFilters(query, money, t);
  const chips = facets.categories.length > 1 || query.category ? facets.categories : [];

  return (
    <>
      <section className="page-header" aria-labelledby="page-title">
        <div className="container page-header__inner">
          <Breadcrumb t={t}
            items={[
              { label: t("common.home"), href: storeHref(basePath, "/") },
              ...(query.category || query.search ? [{ label: title, href: action }] : []),
              { label: heading },
            ]}
          />
          <h1 className="h-page" id="page-title">
            {heading}
          </h1>
          {lead && !query.search ? <p className="lead">{lead}</p> : null}
          {showCategories && chips.length ? (
            <nav aria-label={t("listing.categories")}>
              <ul className="chips">
                <li>
                  <Link className="chip" href={href({ category: undefined })} aria-current={!query.category ? "page" : undefined}>
                    {t("listing.all")}
                  </Link>
                </li>
                {chips.map((c) => (
                  <li key={c.value}>
                    <Link className="chip" href={href({ category: c.value })} aria-current={c.selected ? "page" : undefined}>
                      {c.value} <span className="chip__count">{c.count}</span>
                      <span className="visually-hidden"> {t("listing.productWord", { count: c.count })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </section>

      <div className="section">
        <div className="container shop-layout">
          <FiltersPanel action={action} hidden={{ search: query.search, category: showCategories ? query.category : undefined, sort: query.sort !== query.defaultSort ? query.sort : undefined }} clearHref={href({ brand: [], tag: [], opt: [], min: undefined, max: undefined, stock: undefined })}>
            {/* Keyed on the filters, so the boxes match the address after a filter is removed from a chip. */}
            <FilterGroups key={queryString(query, { page: undefined })} facets={facets} query={query} money={money} currency={profile.currencyCode} t={t} />
          </FiltersPanel>

          <section aria-labelledby="results-title">
            <h2 className="visually-hidden" id="results-title">
              {t("listing.products")}
            </h2>
            <div className="toolbar">
              <p className="toolbar__count" role="status">
                {total === 0 ? t("listing.noProductsFound") : t("listing.showing", { first, last, count: total })}
              </p>
              {total > 1 ? (
                <SortSelect
                  action={action}
                  value={query.sort}
                  searching={Boolean(query.search)}
                  hidden={{ search: query.search, category: query.category, min: query.minPrice?.toString(), max: query.maxPrice?.toString(), stock: query.inStockOnly ? "in" : undefined }}
                  repeated={{ brand: query.brands, tag: query.tags, opt: Object.entries(query.options).flatMap(([n, vs]) => vs.map((v) => `${n}:${v}`)) }}
                />
              ) : null}
            </div>

            {pills.length ? (
              <div className="applied-filters">
                <h3 className="visually-hidden">{t("listing.filtersInUse")}</h3>
                <ul className="chips chips--wrap">
                  {pills.map((p) => (
                    <li key={p.label}>
                      <Link className="chip chip--removable" href={`${action}${p.href}`}>
                        {p.label}
                        <Icon name="close" size="sm" />
                        <span className="visually-hidden"> {t("listing.removeFilter")}</span>
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link className="link-btn" href={href({ brand: [], tag: [], opt: [], min: undefined, max: undefined, stock: undefined })}>
                      {t("listing.clearAllFilters")}
                    </Link>
                  </li>
                </ul>
              </div>
            ) : null}

            {/* The first row (four across on wide screens) is what a shopper sees first, so its photos load straight away. */}
            {products.length ? (
              <ProductGridList products={products} basePath={basePath} variant={site.theme.cardVariant} eagerCount={4} />
            ) : (
              <div className="empty-state">
                <Icon name="search" />
                <p className="body-copy">
                  {query.search || query.category || query.filtered ? t("listing.nothingMatches") : t("listing.noProductsYet")}
                </p>
                {didYouMean ? (
                  <p className="body-copy">
                    {t.rich("listing.didYouMean", { suggestion: <Link href={href({ search: didYouMean })}>{didYouMean}</Link> })}
                  </p>
                ) : null}
                {query.filtered ? (
                  <Link className="btn btn--outline" href={href({ brand: [], tag: [], opt: [], min: undefined, max: undefined, stock: undefined })}>
                    {t("listing.clearTheFilters")}
                  </Link>
                ) : query.search || query.category ? (
                  <Link className="btn btn--outline" href={storeHref(basePath, STORE_PATHS.products)}>
                    {t("listing.seeAllProducts")}
                  </Link>
                ) : null}
              </div>
            )}

            {pageCount > 1 ? (
              <nav className="pagination" aria-label={t("listing.pagesOfProducts")}>
                <ul>
                  <li>
                    {query.page > 1 ? (
                      <Link href={href({ page: query.page > 2 ? String(query.page - 1) : undefined })}>
                        <Icon name="chevron-left" size="sm" />
                        {t("common.previous")}<span className="visually-hidden">{t("listing.pageHint")}</span>
                      </Link>
                    ) : (
                      <span className="is-disabled" aria-disabled="true">
                        <Icon name="chevron-left" size="sm" />
                        {t("common.previous")}<span className="visually-hidden">{t("listing.pageHint")}</span>
                      </span>
                    )}
                  </li>
                  {pageNumbers(query.page, pageCount).map((n, i) =>
                    n === "gap" ? (
                      <li key={`gap-${i}`} aria-hidden="true">
                        <span className="pagination__gap">…</span>
                      </li>
                    ) : (
                      <li key={n}>
                        <Link href={href({ page: n > 1 ? String(n) : undefined })} aria-current={n === query.page ? "page" : undefined} aria-label={t("listing.pageNumber", { number: n })}>
                          {n}
                        </Link>
                      </li>
                    ),
                  )}
                  <li>
                    {query.page < pageCount ? (
                      <Link href={href({ page: String(query.page + 1) })}>
                        {t("common.next")}<span className="visually-hidden">{t("listing.pageHint")}</span> <Icon name="chevron-right" size="sm" />
                      </Link>
                    ) : (
                      <span className="is-disabled" aria-disabled="true">
                        {t("common.next")}<span className="visually-hidden">{t("listing.pageHint")}</span> <Icon name="chevron-right" size="sm" />
                      </span>
                    )}
                  </li>
                </ul>
              </nav>
            ) : null}
          </section>
        </div>
      </div>
    </>
  );
}

/** The filter checkboxes and price fields, each with how many products it would leave. */
function FilterGroups({ facets, query, money, currency, t }: { facets: CatalogueFacets; query: ParsedListing; money: (n: number) => string; currency: string; t: Translator }) {
  const checks = (name: string, values: CatalogueFacets["brands"], valueOf: (v: string) => string = (v) => v) =>
    values.map((v) => (
      <label className="check" key={v.value}>
        <input type="checkbox" name={name} value={valueOf(v.value)} defaultChecked={v.selected} />
        {v.value}
        <span className="check__count">
          {v.count}
          <span className="visually-hidden"> {t("listing.productWord", { count: v.count })}</span>
        </span>
      </label>
    ));
  return (
    <>
      {facets.options.map((o) => (
        <fieldset className="filter-group" key={o.name}>
          <legend>{o.name}</legend>
          {checks("opt", o.values, (v) => `${o.name}:${v}`)}
        </fieldset>
      ))}
      {facets.brands.length > 1 || query.brands.length ? (
        <fieldset className="filter-group">
          <legend>{t("listing.brand")}</legend>
          {checks("brand", facets.brands)}
        </fieldset>
      ) : null}
      {facets.tags.length > 1 || query.tags.length ? (
        <fieldset className="filter-group">
          <legend>{t("listing.type")}</legend>
          {checks("tag", facets.tags)}
        </fieldset>
      ) : null}
      {facets.price && facets.price.max > facets.price.min ? (
        <fieldset className="filter-group">
          <legend>{t("listing.priceIn", { currency })}</legend>
          <p className="hint">
            {t("listing.priceSpan", { min: money(facets.price.min), max: money(facets.price.max) })}
          </p>
          <div className="price-range">
            <div className="field">
              <label htmlFor="filter-min">{t("listing.lowest")}</label>
              <input className="input" id="filter-min" name="min" type="number" inputMode="decimal" min={0} step="any" placeholder={String(Math.floor(facets.price.min))} defaultValue={query.minPrice ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="filter-max">{t("listing.highest")}</label>
              <input className="input" id="filter-max" name="max" type="number" inputMode="decimal" min={0} step="any" placeholder={String(Math.ceil(facets.price.max))} defaultValue={query.maxPrice ?? ""} />
            </div>
          </div>
        </fieldset>
      ) : null}
      <fieldset className="filter-group">
        <legend>{t("listing.availability")}</legend>
        <label className="check">
          <input type="checkbox" name="stock" value="in" defaultChecked={query.inStockOnly} />
          {t("listing.inStockOnly")}
          <span className="check__count">
            {facets.inStock}
            <span className="visually-hidden"> {t("listing.productWord", { count: facets.inStock })}</span>
          </span>
        </label>
      </fieldset>
    </>
  );
}
