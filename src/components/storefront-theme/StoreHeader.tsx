"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/components/shop/CartProvider";
import CurrencySwitcher from "./CurrencySwitcher";
import SearchBox from "./SearchBox";
import BasketDrawer from "./BasketDrawer";
import { openBasketDrawer } from "@/lib/shop/basket-code";
import type { StoreSocialLink } from "./socials";
import { Icon } from "./primitives";
import { useStorefront } from "./StorefrontProvider";
import { useShopAccount } from "./useShopAccount";

export type HeaderNavItem = { label: string; href: string; children?: Array<{ label: string; href: string }> };

export type StoreBrandProps = {
  storeName: string;
  homeHref: string;
  logoUrl: string | null;
  logoAlt: string;
  /** Loftwood shows a round initial mark beside the word when there's no logo. */
  showMark: boolean;
};

export function StoreLogo({ storeName, homeHref, logoUrl, logoAlt, showMark }: StoreBrandProps) {
  return (
    <Link className="logo" href={homeHref} aria-label={`${storeName}, home page`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- small brand mark, any host
        <img className="logo__img" src={logoUrl} alt={logoAlt || storeName} width={160} height={48} />
      ) : (
        <>
          {showMark ? (
            <span className="logo__mark" aria-hidden="true">
              {storeName.trim().charAt(0).toUpperCase()}
            </span>
          ) : null}
          <span className="logo__word" aria-hidden="true">
            {storeName}
          </span>
        </>
      )}
    </Link>
  );
}

/** The shopper's account: "Sign in" for guests, their name once signed in. */
function AccountLink() {
  const { href } = useStorefront();
  const { account } = useShopAccount();
  const label = account ? `Your account${account.name ? `, signed in as ${account.name}` : ""}` : "Sign in or create an account";
  return (
    <Link className="icon-btn" href={href("/account")} aria-label={label}>
      <Icon name="user" />
    </Link>
  );
}

function BasketLink({ href }: { href: string }) {
  const count = useCartStore((s) => (s.hasHydrated ? s.lines.reduce((sum, l) => sum + l.quantity, 0) : 0));
  return (
    <Link
      className="icon-btn"
      href={href}
      aria-label={count ? `Basket, ${count} ${count === 1 ? "item" : "items"}` : "Basket, empty"}
      aria-haspopup="dialog"
      onClick={(e) => {
        // Opens the basket panel; a new tab (or no JavaScript) still goes to the basket page.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openBasketDrawer();
      }}
    >
      <Icon name="bag" />
      {count > 0 ? (
        <span className="badge" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

export default function StoreHeader({
  brand,
  navItems,
  announcement,
  productsHref,
  cartHref,
  logoPosition = "start",
  topbarExtras,
}: {
  brand: StoreBrandProps;
  navItems: HeaderNavItem[];
  announcement: { text: string; href: string | null };
  productsHref: string;
  cartHref: string;
  /** Sage and Stem centres the logo between the menu and the icons; its CSS expects it after the menu in the markup. */
  logoPosition?: "start" | "centre";
  /** Loftwood's announcement bar also carries the phone number and social links. */
  topbarExtras?: { phone: string | null; socials: StoreSocialLink[] };
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Close everything after navigating to another page (state reset during
  // render, React's recommended alternative to doing it in an effect).
  const [shownPath, setShownPath] = useState(pathname);
  if (pathname !== shownPath) {
    setShownPath(pathname);
    setMenuOpen(false);
    setSearchOpen(false);
    setOpenSubmenu(null);
  }

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => e.matches && setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openSubmenu !== null) {
        // Back to the button that opened it, so keyboard users don't lose their place.
        headerRef.current?.querySelector<HTMLButtonElement>(`[aria-controls="sub-${openSubmenu}"]`)?.focus();
        setOpenSubmenu(null);
      } else if (searchOpen) {
        setSearchOpen(false);
        searchButton.current?.focus();
      } else if (menuOpen) {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setOpenSubmenu(null);
    };
    desktop.addEventListener("change", onChange);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      desktop.removeEventListener("change", onChange);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [menuOpen, searchOpen, openSubmenu]);

  // The mobile menu acts as a dialog while open: focus moves into it, Tab stays
  // between the close button and the menu, the page behind can't be reached or
  // scrolled, and focus goes back to the menu button when it closes.
  useEffect(() => {
    if (!menuOpen || window.matchMedia("(min-width: 1024px)").matches) return;
    const nav = document.getElementById("site-nav");
    const button = menuButton.current;
    if (!nav || !button) return;
    const focusables = () => [button, ...nav.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter((el) => el.offsetParent !== null);
    focusables()[1]?.focus();

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    // Everything but the menu and its button: each level's siblings on the way up to <body>.
    const behind: HTMLElement[] = [];
    for (let el: HTMLElement | null = button.closest<HTMLElement>(".nav-wrap"); el && el !== document.body; el = el.parentElement) {
      for (const sibling of el.parentElement?.children ?? []) {
        if (sibling === el || !(sibling instanceof HTMLElement) || sibling.hasAttribute("inert")) continue;
        // The page's live region keeps announcing.
        if (sibling.id === "announcer" || sibling.querySelector("#announcer") || sibling.tagName === "SCRIPT") continue;
        behind.push(sibling);
      }
    }
    behind.forEach((el) => el.setAttribute("inert", ""));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onTab);
    return () => {
      document.removeEventListener("keydown", onTab);
      behind.forEach((el) => el.removeAttribute("inert"));
      document.body.style.overflow = overflow;
      if (nav.contains(document.activeElement) || document.activeElement === document.body) button.focus();
    };
  }, [menuOpen]);

  const isCurrent = (href: string) => href === pathname;

  return (
    <>
      {announcement.text ? (
        <aside className="topbar" aria-label="Store announcements">
          <div className="container topbar__inner">
            {topbarExtras?.phone ? (
              <p className="topbar__side">
                Call us: <a href={`tel:${topbarExtras.phone.replace(/[^\d+]/g, "")}`}>{topbarExtras.phone}</a>
              </p>
            ) : null}
            <p>{announcement.href ? <Link href={announcement.href}>{announcement.text}</Link> : announcement.text}</p>
            {topbarExtras?.socials.length ? (
              <ul className="topbar__side topbar__social">
                {topbarExtras.socials.map((s) => (
                  <li key={s.href}>
                    <a className="icon-btn" href={s.href} aria-label={`${brand.storeName} on ${s.label}`} rel="noopener noreferrer" target="_blank">
                      {s.iconSm}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </aside>
      ) : null}

      <header className="site-header" ref={headerRef}>
        <div className="container site-header__inner">
          {logoPosition === "start" ? <StoreLogo {...brand} /> : null}

          <div className="nav-wrap">
            <button
              ref={menuButton}
              className="icon-btn menu-btn"
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="site-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name="menu" className="icon-open" />
              <Icon name="close" className="icon-close" />
            </button>
            <nav className={`site-nav${menuOpen ? " is-open" : ""}`} id="site-nav" aria-label="Main">
              <ul className="nav-list">
                {navItems.map((item, i) =>
                  item.children?.length ? (
                    <li key={item.label + i}>
                      <button
                        className="nav-toggle"
                        type="button"
                        aria-expanded={openSubmenu === i}
                        aria-controls={`sub-${i}`}
                        onClick={() => setOpenSubmenu((open) => (open === i ? null : i))}
                      >
                        {item.label} <Icon name="chevron-down" size="sm" />
                      </button>
                      <ul className="subnav" id={`sub-${i}`}>
                        {item.children.map((child) => (
                          <li key={child.href}>
                            <Link href={child.href} aria-current={isCurrent(child.href) ? "page" : undefined}>
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ) : (
                    <li key={item.label + i}>
                      <Link href={item.href} aria-current={isCurrent(item.href) ? "page" : undefined}>
                        {item.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </nav>
          </div>

          {logoPosition === "centre" ? <StoreLogo {...brand} /> : null}

          <div className="header-actions">
            <CurrencySwitcher />
            <button
              ref={searchButton}
              className="icon-btn"
              type="button"
              aria-label="Search"
              aria-expanded={searchOpen}
              aria-controls="site-search"
              onClick={() => setSearchOpen((open) => !open)}
            >
              <Icon name="search" />
            </button>
            <AccountLink />
            <BasketLink href={cartHref} />
          </div>
        </div>

        <div className={`site-search${searchOpen ? " is-open" : ""}`} id="site-search">
          <div className="container">
            <form role="search" action={productsHref} method="get">
              <label className="visually-hidden" htmlFor="q">
                Search products
              </label>
              <SearchBox inputRef={searchInput} />
              <button className="btn btn--primary" type="submit">
                Search
              </button>
            </form>
          </div>
        </div>
      </header>
      <BasketDrawer />
    </>
  );
}
