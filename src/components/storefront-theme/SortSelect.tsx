"use client";

import type { ShopProductSort } from "@/lib/shop/products";

const OPTIONS: Array<{ value: ShopProductSort; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "rating", label: "Highest rated" },
];

/** Sort control that applies on change; the form still submits normally without JavaScript. */
export default function SortSelect({ action, value, hidden }: { action: string; value: ShopProductSort; hidden: Record<string, string> }) {
  return (
    <form className="toolbar__sort" action={action} method="get">
      {Object.entries(hidden).map(([name, v]) => (
        <input key={name} type="hidden" name={name} value={v} />
      ))}
      <label htmlFor="sort">Sort by</label>
      <select className="select" id="sort" name="sort" defaultValue={value} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {OPTIONS.map((o) => (
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
