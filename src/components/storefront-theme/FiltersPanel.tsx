"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { announce, useT } from "./StorefrontProvider";
import { Icon } from "./primitives";

/**
 * The filter sidebar (a panel behind a button on phones). Ticking a box
 * applies it at once; the price fields apply when the shopper leaves them or
 * presses Enter. Without JavaScript it's a normal form with an Apply button.
 */
export default function FiltersPanel({
  action,
  hidden,
  clearHref,
  children,
}: {
  action: string;
  /** Kept as they are when filters change: the search, category and sort. */
  hidden: Record<string, string | undefined>;
  clearHref: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  const apply = () => {
    if (!form.current) return;
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form.current)) if (typeof value === "string" && value.trim()) params.append(name, value.trim());
    router.push(`${action}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
  };

  // Tell screen-reader users the results changed (the count is in the toolbar's status line).
  const shown = useRef(`${pathname}?${searchParams.toString()}`);
  useEffect(() => {
    const now = `${pathname}?${searchParams.toString()}`;
    if (now === shown.current) return;
    shown.current = now;
    const count = document.querySelector(".toolbar__count")?.textContent;
    if (count) announce(t("listing.filtersApplied", { results: count }));
  }, [pathname, searchParams, t]);

  return (
    <div>
      <button
        ref={toggle}
        className="btn btn--outline filters-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="filters"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="filter" size="sm" />
        {open ? t("listing.hideFilters") : t("listing.filterProducts")}
      </button>
      <form
        ref={form}
        className={`filters${open ? " is-open" : ""}`}
        id="filters"
        action={action}
        method="get"
        aria-labelledby="filters-title"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        onChange={(e) => {
          if (e.target instanceof HTMLInputElement && e.target.type === "checkbox") apply();
        }}
        onBlur={(e) => {
          const input = e.target;
          if (input instanceof HTMLInputElement && input.type === "number" && input.value !== input.defaultValue) apply();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            setOpen(false);
            toggle.current?.focus();
          }
        }}
      >
        <h2 className="visually-hidden" id="filters-title">
          {t("listing.filterProducts")}
        </h2>
        {Object.entries(hidden).map(([name, v]) => (v ? <input key={name} type="hidden" name={name} value={v} /> : null))}
        {children}
        <div className="filters__actions">
          <button className="btn btn--primary" type="submit">
            {t("listing.applyFilters")}
          </button>
          <a className="btn btn--outline" href={clearHref}>
            {t("listing.clearAll")}
          </a>
        </div>
      </form>
    </div>
  );
}
