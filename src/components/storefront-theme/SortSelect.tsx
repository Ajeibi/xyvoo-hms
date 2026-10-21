"use client";

import { useRouter } from "next/navigation";
import type { ListingSort } from "@/lib/shop/catalogue-filter";

const OPTIONS: Array<{ value: ListingSort; label: string }> = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "rating", label: "Highest rated" },
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
  const router = useRouter();
  const options = searching ? [{ value: "relevance" as const, label: "Best match" }, ...OPTIONS] : OPTIONS;

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
      <label htmlFor="sort">Sort by</label>
      <select key={value} className="select" id="sort" name="sort" defaultValue={value} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <noscript>
        <button className="btn btn--outline" type="submit">
          Sort
        </button>
      </noscript>
    </form>
  );
}
