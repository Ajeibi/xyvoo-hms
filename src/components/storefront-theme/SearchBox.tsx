"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FixedPrices } from "@/lib/store/currencies";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { useStorefront, useT } from "./StorefrontProvider";
import { Price, StoreImage } from "./primitives";

type Suggestion =
  | { kind: "product"; key: string; label: string; href: string; imageUrl: string | null; price: number; compareAt: number | null; fixedPrices: FixedPrices; inStock: boolean }
  | { kind: "category"; key: string; label: string; href: string }
  | { kind: "all"; key: string; label: string; href: string };

type ApiResult = {
  products: Array<{ id: string; name: string; slug: string; imageUrl: string | null; price: number; compareAt: number | null; fixedPrices: FixedPrices; inStock: boolean }>;
  categories: string[];
};

/** Wait this long after the last key before asking, so typing a word sends one request, not one per letter. */
const DEBOUNCE_MS = 200;

/**
 * The header's search field, with suggestions as the shopper types (products
 * with photo and price, and matching categories). Follows the ARIA combobox
 * pattern: arrow keys move through the list, Enter opens the highlighted one
 * (or searches), Escape closes the list. Without JavaScript it's a plain
 * search form.
 */
export default function SearchBox({ inputRef }: { inputRef: React.RefObject<HTMLInputElement | null> }) {
  const { slug, basePath, language } = useStorefront();
  const t = useT();
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ticket = ++latest.current;
    const href = (path: string) => storeHref(basePath, path);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/search?q=${encodeURIComponent(q)}&lang=${language}`);
        const data = (await res.json()) as ApiResult;
        // An older, slower answer mustn't replace a newer one.
        if (ticket !== latest.current) return;
        const next: Suggestion[] = [
          ...data.products.map((p) => ({ kind: "product" as const, key: p.id, label: p.name, href: href(STORE_PATHS.product(p.slug)), imageUrl: p.imageUrl, price: p.price, compareAt: p.compareAt, fixedPrices: p.fixedPrices, inStock: p.inStock })),
          ...data.categories.map((c) => ({ kind: "category" as const, key: `c-${c}`, label: c, href: href(STORE_PATHS.category(c)) })),
          { kind: "all" as const, key: "all", label: t("chrome.seeAllResults", { query: q }), href: `${href(STORE_PATHS.products)}?search=${encodeURIComponent(q)}` },
        ];
        setItems(next);
        setActive(-1);
        setOpen(true);
        const found = data.products.length;
        setStatus(found ? t("chrome.suggestions", { count: found }) : t("chrome.noSuggestions"));
      } catch {
        // No suggestions this time; the search itself still works.
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, slug, basePath, language, t]);

  const go = (target: string) => {
    setOpen(false);
    router.push(target);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && open && active >= 0) {
      e.preventDefault();
      go(items[active].href);
    } else if (e.key === "Escape" && open) {
      // Close just the list; a second Escape closes the search (the header's own handler).
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
      setActive(-1);
    }
  };

  const expanded = open && items.length > 0;
  return (
    <div className="search-box">
      <input
        ref={inputRef}
        className="input"
        id="q"
        name="search"
        type="search"
        placeholder={t("chrome.searchProducts")}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // Too short to suggest anything: clear the list, and let any answer still on its way be ignored.
          if (e.target.value.trim().length < 2) {
            latest.current++;
            setItems([]);
            setOpen(false);
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onFocus={() => items.length && setOpen(true)}
      />
      <ul className={`search-box__list${expanded ? " is-open" : ""}`} id={listId} role="listbox" aria-label={t("chrome.searchSuggestions")}>
        {expanded
          ? items.map((item, i) => (
              <li
                key={item.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`search-box__option search-box__option--${item.kind}${i === active ? " is-active" : ""}`}
                // Pointer down, not click: a click would blur the field first and close the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(item.href);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {item.kind === "product" ? (
                  <>
                    <span className="media search-box__thumb" aria-hidden="true">
                      {item.imageUrl ? <StoreImage src={item.imageUrl} alt="" sizes="48px" /> : null}
                    </span>
                    <span className="search-box__text">
                      <span className="search-box__name">{item.label}</span>
                      <span className="search-box__price">
                        <Price amount={item.price} compareAt={item.compareAt} fixedPrices={item.fixedPrices} />
                        {item.inStock ? null : <span className="search-box__stock"> · {t("chrome.outOfStock")}</span>}
                      </span>
                    </span>
                  </>
                ) : item.kind === "category" ? (
                  <span className="search-box__text">
                    <span className="search-box__hint">{t("chrome.category")}</span> {item.label}
                  </span>
                ) : (
                  <span className="search-box__all">{item.label}</span>
                )}
              </li>
            ))
          : null}
      </ul>
      <p className="visually-hidden" role="status">
        {status}
      </p>
    </div>
  );
}
