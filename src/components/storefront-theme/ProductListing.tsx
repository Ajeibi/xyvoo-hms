import Link from "next/link";
import { listShopProducts, SHOP_PRODUCT_SORTS, type ShopProductSort } from "@/lib/shop/products";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import type { Storefront } from "@/lib/store/site/storefront";
import { ProductGridList } from "./ProductCard";
import SortSelect from "./SortSelect";
import { Breadcrumb, Icon } from "./primitives";

const PAGE_SIZE = 24;

export type ListingQuery = { category?: string; search?: string; sort?: string; page?: string };

export function parseListingQuery(query: ListingQuery) {
  const sort = (SHOP_PRODUCT_SORTS as readonly string[]).includes(query.sort ?? "") ? (query.sort as ShopProductSort) : "newest";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  return {
    category: query.category?.trim().slice(0, 100) || undefined,
    search: query.search?.trim().slice(0, 100) || undefined,
    sort,
    page,
  };
}

/** Product grid page with category chips, sort and pagination, used by "all products" and collection pages. */
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
  query: ReturnType<typeof parseListingQuery>;
  collectionId?: string;
  showCategories?: boolean;
}) {
  const { basePath, categories, site } = storefront;
  const { products, total } = await listShopProducts(storefront.tenant.id, {
    category: query.category,
    search: query.search,
    sort: query.sort,
    page: query.page,
    pageSize: PAGE_SIZE,
    collectionId,
  });

  const action = storeHref(basePath, listingPath);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const linkFor = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
    const qs = search.toString();
    return qs ? `${action}?${qs}` : action;
  };
  const keep = { category: query.category, search: query.search, sort: query.sort === "newest" ? undefined : query.sort };
  const first = total === 0 ? 0 : (query.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, query.page * PAGE_SIZE);
  const heading = query.search ? `Results for “${query.search}”` : query.category ? query.category : title;

  return (
    <>
      <section className="page-header" aria-labelledby="page-title">
        <div className="container page-header__inner">
          <Breadcrumb
            items={[
              { label: "Home", href: storeHref(basePath, "/") },
              ...(query.category || query.search ? [{ label: title, href: action }] : []),
              { label: heading },
            ]}
          />
          <h1 className="h-page" id="page-title">
            {heading}
          </h1>
          {lead && !query.search ? <p className="lead">{lead}</p> : null}
          {showCategories && categories.length > 1 ? (
            <nav aria-label="Categories">
              <ul className="chips">
                <li>
                  <Link className="chip" href={linkFor({ search: query.search, sort: keep.sort })} aria-current={!query.category ? "page" : undefined}>
                    All
                  </Link>
                </li>
                {categories.map((c) => (
                  <li key={c}>
                    <Link className="chip" href={linkFor({ ...keep, category: c })} aria-current={query.category === c ? "page" : undefined}>
                      {c}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </section>

      <div className="section">
        <div className="container">
          <section aria-labelledby="results-title">
            <h2 className="visually-hidden" id="results-title">
              Products
            </h2>
            <div className="toolbar">
              <p className="toolbar__count" role="status">
                {total === 0 ? "No products found" : `Showing ${first} to ${last} of ${total} ${total === 1 ? "product" : "products"}`}
              </p>
              {total > 1 ? (
                <SortSelect
                  action={action}
                  value={query.sort}
                  hidden={Object.fromEntries(Object.entries({ category: query.category, search: query.search }).filter((e): e is [string, string] => Boolean(e[1])))}
                />
              ) : null}
            </div>

            {products.length ? (
              <ProductGridList products={products} basePath={basePath} variant={site.theme.cardVariant} />
            ) : (
              <div className="empty-state">
                <Icon name="search" />
                <p className="body-copy">
                  {query.search || query.category ? "Nothing matches that yet. Try another search or category." : "There are no products here yet. Please check back soon."}
                </p>
                {query.search || query.category ? (
                  <Link className="btn btn--outline" href={storeHref(basePath, STORE_PATHS.products)}>
                    See all products
                  </Link>
                ) : null}
              </div>
            )}

            {pageCount > 1 ? (
              <nav className="pagination" aria-label="Pages of products">
                <ul>
                  <li>
                    {query.page > 1 ? (
                      <Link href={linkFor({ ...keep, page: String(query.page - 1) })}>
                        <Icon name="chevron-left" size="sm" />
                        Previous<span className="visually-hidden"> page</span>
                      </Link>
                    ) : (
                      <span className="is-disabled" aria-disabled="true">
                        <Icon name="chevron-left" size="sm" />
                        Previous<span className="visually-hidden"> page</span>
                      </span>
                    )}
                  </li>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                    <li key={n}>
                      <Link href={linkFor({ ...keep, page: n > 1 ? String(n) : undefined })} aria-current={n === query.page ? "page" : undefined} aria-label={`Page ${n}`}>
                        {n}
                      </Link>
                    </li>
                  ))}
                  <li>
                    {query.page < pageCount ? (
                      <Link href={linkFor({ ...keep, page: String(query.page + 1) })}>
                        Next<span className="visually-hidden"> page</span> <Icon name="chevron-right" size="sm" />
                      </Link>
                    ) : (
                      <span className="is-disabled" aria-disabled="true">
                        Next<span className="visually-hidden"> page</span> <Icon name="chevron-right" size="sm" />
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
