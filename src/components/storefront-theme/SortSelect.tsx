"use client";

import { useRouter } from "next/navigation";
import type { ListingSort } from "@/lib/shop/catalogue-filter";
import type { MessageKey } from "@/lib/store/i18n/messages";
import { useT } from "./StorefrontProvider";

const OPTIONS: Array<{ value: ListingSort; label: MessageKey }> = [
  { value: "featured", label: "listing.sortFeatured" },
  { value: "newest", label: "listing.sortNewest" },
  { value: "price-asc", label: "listing.sortPriceAsc" },
  { value: "price-desc", label: "listing.sortPriceDesc" },
  { value: "rating", label: "listing.sortRating" },
];

/** Sort control that applies on change, keeping the search and filters; the form still submits normally without JavaScript. */
export default function SortSelect({
  action,
  value,
  searching,
  hidden,
  repeated,
}: {
  action: string;
  value: ListingSort;
  /** A search offers "Best match" (its own order) first. */
  searching: boolean;
  hidden: Record<string, string | undefined>;
  /** Filters that can be chosen more than once (brand, tag, option). */
  repeated: Record<string, string[]>;
}) {
  const t = useT();
  const router = useRouter();
  const options = searching ? [{ value: "relevance" as const, label: "listing.sortRelevance" as const }, ...OPTIONS] : OPTIONS;

  return (
    <form
      className="toolbar__sort"
      action={action}
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams(new FormData(e.currentTarget) as unknown as Record<string, string>);
        router.push(`${action}?${params.toString()}`, { scroll: false });
      }}
    >
      {Object.entries(hidden).map(([name, v]) => (v ? <input key={name} type="hidden" name={name} value={v} /> : null))}
      {Object.entries(repeated).flatMap(([name, values]) => values.map((v) => <input key={`${name}-${v}`} type="hidden" name={name} value={v} />))}
      <label htmlFor="sort">{t("listing.sortBy")}</label>
      <select key={value} className="select" id="sort" name="sort" defaultValue={value} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {t(o.label)}
          </option>
        ))}
      </select>
      <noscript>
        <button className="btn btn--outline" type="submit">
          {t("listing.sort")}
        </button>
      </noscript>
    </form>
  );
}
