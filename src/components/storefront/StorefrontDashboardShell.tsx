"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  BellRing,
  CreditCard,
  History,
  Check,
  CircleAlert,
  ExternalLink,
  LifeBuoy,
  Link2,
  Globe,
  Home,
  Layers,
  LogOut,
  Menu,
  Package,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  Star,
  Tag,
  Truck,
  UserCog,
  Users,
  X,
} from "lucide-react";
import DashboardBell from "./DashboardBell";
import { MEANING, SECTION_MEANING } from "./meaning";

type ShopStatus = "draft" | "live" | "paused";

type StorefrontDashboardShellProps = {
  children: React.ReactNode;
  slug: string;
  /** Sets the rounder heading typeface for everything inside. */
  fontClassName?: string;
  storeDisplayName: string;
  logoUrl: string | null;
  currentUserName: string;
  roleLabel: string;
  shopStatus: ShopStatus;
  /** Owners and admins can open the shop from the status badge. */
  canOpenShop?: boolean;
  /** The sections this person's role can open (see canUseStoreSection); others are left out of the menu. */
  allowedSections: readonly string[];
};

type NavItem = { key: string; label: string; path: string; icon: React.ComponentType<{ className?: string }> };

const STATUS_PILL: Record<ShopStatus, { label: string; className: string; dot: string }> = {
  live: { label: "Live", className: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  draft: { label: "Not live yet", className: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  paused: { label: "Offline", className: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

const COLLAPSED_KEY = "xyvoo_storefront_sidebar_collapsed";
const collapsedListeners = new Set<() => void>();
// Used when the browser blocks storage (some private windows): the button still works, it just isn't remembered.
let collapsedInMemory = false;

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return collapsedInMemory;
  }
}

function writeCollapsed(value: boolean) {
  collapsedInMemory = value;
  try {
    localStorage.setItem(COLLAPSED_KEY, String(value));
  } catch {
    // Storage blocked: kept in memory instead.
  }
  collapsedListeners.forEach((listener) => listener());
}

function subscribeCollapsed(listener: () => void) {
  collapsedListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    collapsedListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export default function StorefrontDashboardShell({
  children,
  slug,
  fontClassName = "",
  storeDisplayName,
  logoUrl,
  currentUserName,
  roleLabel,
  shopStatus,
  canOpenShop = false,
  allowedSections,
}: StorefrontDashboardShellProps) {
  const pathname = usePathname();
  const base = `/storefront/${slug}`;
  const drawerRef = useRef<HTMLDialogElement>(null);
  const [ordersWaiting, setOrdersWaiting] = useState(0);
  const [reviewsWaiting, setReviewsWaiting] = useState(0);
  /** The count shown beside a menu item: orders that need the shop, or reviews to approve. */
  const badgeFor = (key: string) => (key === "orders" ? ordersWaiting : key === "reviews" ? reviewsWaiting : 0);
  const badgeWords = (key: string, n: number) =>
    key === "reviews" ? `${n === 1 ? "review" : "reviews"} to approve` : `${n === 1 ? "order needs" : "orders need"} you`;
  // Remembered per browser; the server always renders it open.
  const isCollapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const toggleCollapse = () => writeCollapsed(!isCollapsed);

  // Grouped the way a shop owner thinks about their day: selling, growing, and the shop itself.
  const allGroups: { title: string | null; items: NavItem[] }[] = [
    { title: null, items: [{ key: "dashboard", label: "Home", path: `${base}/dashboard`, icon: Home }] },
    {
      title: "Sell",
      items: [
        { key: "orders", label: "Orders", path: `${base}/orders`, icon: ShoppingCart },
        { key: "products", label: "Products", path: `${base}/products`, icon: Package },
        { key: "collections", label: "Collections", path: `${base}/collections`, icon: Layers },
        { key: "customers", label: "Customers", path: `${base}/customers`, icon: Users },
        { key: "discounts", label: "Discounts", path: `${base}/discounts`, icon: Tag },
        { key: "reviews", label: "Reviews", path: `${base}/reviews`, icon: Star },
      ],
    },
    {
      title: "Grow",
      items: [
        { key: "analytics", label: "Analytics", path: `${base}/analytics`, icon: BarChart3 },
        { key: "abandoned-carts", label: "Abandoned carts", path: `${base}/abandoned-carts`, icon: ShoppingBasket },
        { key: "notifications", label: "Notifications", path: `${base}/notifications`, icon: Bell },
      ],
    },
    {
      title: "Your shop",
      items: [
        { key: "website", label: "Website", path: `${base}/website`, icon: Palette },
        { key: "domain", label: "Web address", path: `${base}/domain`, icon: Globe },
        { key: "delivery", label: "Delivery", path: `${base}/delivery`, icon: Truck },
        { key: "payments", label: "Payments and plan", path: `${base}/payments`, icon: CreditCard },
        { key: "settings", label: "Store details", path: `${base}/settings`, icon: Settings },
      ],
    },
    {
      title: "Team",
      items: [
        { key: "team", label: "Team", path: `${base}/team`, icon: UserCog },
        { key: "activity", label: "Activity", path: `${base}/activity`, icon: History },
        { key: "alerts", label: "Order alerts", path: `${base}/alerts`, icon: BellRing },
      ],
    },
  ];
  // Staff only see the screens they can use; the pages and APIs refuse the rest too.
  const groups = allGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => allowedSections.includes(item.key)) }))
    .filter((group) => group.items.length > 0);
  const navItems = groups.flatMap((g) => g.items);
  const activeKey =
    navItems
      .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
      .sort((a, b) => b.path.length - a.path.length)[0]?.key ?? null;

  // The Orders count refreshes as the merchant moves around, so it reflects orders they've just updated.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store/orders/attention?slug=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setOrdersWaiting(Number(data.total) || 0);
          setReviewsWaiting(Number(data.reviews) || 0);
        }
      })
      .catch(() => {});
    drawerRef.current?.close();
    return () => {
      cancelled = true;
    };
  }, [slug, pathname]);

  const status = STATUS_PILL[shopStatus];
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState<{ tone: "warning" | "error" | "success"; text: string } | null>(null);

  // The "Offline" / "Not live yet" badge opens the shop in one click. It goes live even without a way
  // to pay; checkout then says ordering isn't open, and we warn here so the owner can fix it.
  const openShop = async () => {
    // On phones the badge sits in the menu drawer: close it so the message underneath is seen.
    drawerRef.current?.close();
    setOpening(true);
    setNotice(null);
    try {
      const res = await fetch("/api/store/site/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, action: "publish" }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ tone: "error", text: typeof body.error === "string" ? body.error : "We couldn't open your shop just now. Please try again." });
        return;
      }
      setNotice(typeof body.warning === "string" ? { tone: "warning", text: body.warning } : { tone: "success", text: "Your shop is live. Share the link and you're open for business." });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "We couldn't open your shop. Please check your connection and try again." });
    } finally {
      setOpening(false);
    }
  };

  const statusBadge =
    canOpenShop && shopStatus !== "live" ? (
      <button
        type="button"
        onClick={openShop}
        disabled={opening}
        title="Open your shop to customers"
        className={`mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors hover:ring-1 hover:ring-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue disabled:opacity-60 ${status.className}`}
      >
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
        {opening ? "Opening…" : status.label}
        <span className="sr-only">{opening ? "" : ": open your shop now"}</span>
      </button>
    ) : (
      <span className={`mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${status.className}`}>
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
        {status.label}
      </span>
    );

  const noticeBox = notice ? (
    <div
      role={notice.tone === "success" ? "status" : "alert"}
      className={`mb-5 flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm ${
        notice.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-950" : notice.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      {notice.tone === "success" ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <p className="min-w-0 flex-1">{notice.text}</p>
      {notice.tone === "warning" ? (
        <Link href={`${base}/payments`} onClick={() => setNotice(null)} className="shrink-0 font-semibold underline">
          Set up payments
        </Link>
      ) : null}
      <button type="button" onClick={() => setNotice(null)} className="shrink-0 rounded-lg px-1 text-slate-600 hover:text-slate-900">
        <X className="h-4 w-4" aria-hidden />
        <span className="sr-only">Close this message</span>
      </button>
    </div>
  ) : null;

  const renderNavGroup = (group: { title: string | null; items: NavItem[] }, index: number, collapsed: boolean) => {
    if (collapsed) {
      return (
        <div key={group.title ?? index} className={index ? "border-t border-slate-100 pt-2" : ""}>
          <ul className="space-y-1">
            {group.items.map(({ key, label, path, icon: Icon }) => {
              const active = activeKey === key;
              const badge = badgeFor(key);
              return (
                <li key={key}>
                  <Link
                    href={path}
                    title={label}
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    className={`relative mx-auto flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                      active ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className={`h-[18px] w-[18px] shrink-0 ${MEANING[SECTION_MEANING[key] ?? "neutral"].icon}`} />
                    {badge ? (
                      <span
                        className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white shadow-sm ring-1 ring-white"
                        title={`${badge} ${badgeWords(key, badge)}`}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      );
    }

    return (
      <div key={group.title ?? index} className={index ? "mt-5" : ""}>
        {group.title ? <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.title}</p> : null}
        <ul className="space-y-0.5">
          {group.items.map(({ key, label, path, icon: Icon }) => {
            const active = activeKey === key;
            const badge = badgeFor(key);
            return (
              <li key={key}>
                <Link
                  href={path}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-blue-50 text-blue-900" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${active ? "bg-white shadow-sm" : MEANING[SECTION_MEANING[key] ?? "neutral"].tint}`}
                  >
                    <Icon className={`h-4 w-4 ${MEANING[SECTION_MEANING[key] ?? "neutral"].icon}`} />
                  </span>
                  <span className="flex-1">{label}</span>
                  {badge ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      {badge}
                      <span className="sr-only"> {badgeWords(key, badge)}</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const desktopSidebar = (
    <div className="flex h-full flex-col">
      {isCollapsed ? (
        <div className="flex shrink-0 flex-col items-center gap-2.5 border-b border-slate-200 px-2 py-3.5">
          <div className="relative" title={`${storeDisplayName} (${status.label})`}>
            {logoUrl ? (
              <img src={logoUrl} alt={storeDisplayName} className="h-9 w-9 shrink-0 rounded-xl border border-slate-200 bg-white object-contain" />
            ) : (
              <div aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-xyvoo-blue text-sm font-bold text-white">
                {(storeDisplayName || slug).charAt(0).toUpperCase() || "S"}
              </div>
            )}
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${status.dot}`} />
          </div>
          <button
            type="button"
            onClick={toggleCollapse}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 py-3.5 pl-4 pr-3">
          <div className="flex min-w-0 items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-xl border border-slate-200 bg-white object-contain" />
            ) : (
              <div aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-xyvoo-blue text-sm font-bold text-white">
                {(storeDisplayName || slug).charAt(0).toUpperCase() || "S"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{storeDisplayName}</p>
              {statusBadge}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleCollapse}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      )}

      <nav aria-label="Store dashboard" className={`min-h-0 flex-1 overflow-y-auto ${isCollapsed ? "px-2 py-3 space-y-3" : "px-3 py-4"}`}>
        {groups.map((group, index) => renderNavGroup(group, index, isCollapsed))}
      </nav>

      {isCollapsed ? null : (
        <a
          href="/support"
          target="_blank"
          rel="noreferrer"
          className="mx-3 mb-2 flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
        >
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <LifeBuoy className="h-4 w-4" />
          </span>
          Help and support
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
      <div className={`shrink-0 border-t border-slate-200 ${isCollapsed ? "p-2 flex flex-col items-center gap-2" : "p-3"}`}>
        {isCollapsed ? (
          <>
            <div
              title={`${currentUserName} (${roleLabel})`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700"
            >
              {initials(currentUserName)}
            </div>
            <form action="/auth/logout?redirect=/auth/login/storefront" method="post">
              <button
                type="submit"
                title="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                <span className="sr-only">Sign out</span>
              </button>
            </form>
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
              {initials(currentUserName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{currentUserName}</p>
              <p className="text-xs text-slate-500">{roleLabel}</p>
            </div>
            <form action="/auth/logout?redirect=/auth/login/storefront" method="post">
              <button
                type="submit"
                title="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                <span className="sr-only">Sign out</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );

  const mobileSidebar = (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 py-4 pl-5 pr-14">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-xl border border-slate-200 bg-white object-contain" />
        ) : (
          <div aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-xyvoo-blue text-sm font-bold text-white">
            {(storeDisplayName || slug).charAt(0).toUpperCase() || "S"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{storeDisplayName}</p>
          {statusBadge}
        </div>
      </div>

      <nav aria-label="Store dashboard" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group, index) => renderNavGroup(group, index, false))}
      </nav>

      <a
        href="/support"
        target="_blank"
        rel="noreferrer"
        className="mx-3 mb-2 flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
      >
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <LifeBuoy className="h-4 w-4" />
        </span>
        Help and support
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      <div className="shrink-0 border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
            {initials(currentUserName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{currentUserName}</p>
            <p className="text-xs text-slate-500">{roleLabel}</p>
          </div>
          <form action="/auth/logout?redirect=/auth/login/storefront" method="post">
            <button
              type="submit"
              title="Sign out"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="sr-only">Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  const [copied, setCopied] = useState(false);
  const shopLink = `/shop/${slug}`;
  const shareLink = async () => {
    const url = `${window.location.origin}${shopLink}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy your shop link:", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareButton = (
    <button
      type="button"
      onClick={shareLink}
      className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 shadow-sm transition-colors hover:bg-blue-100"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-700" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
      {copied ? "Link copied" : "Share shop link"}
    </button>
  );

  const viewShop = (
    <a
      href={`/shop/${slug}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
    >
      {shopStatus === "live" ? "View your shop" : "Preview your shop"}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );

  return (
    <div className={`dash-root flex h-screen overflow-hidden bg-slate-50 ${fontClassName}`}>
      <aside
        className={`hidden shrink-0 border-r border-slate-200 bg-white lg:block transition-[width] duration-200 ease-in-out ${
          isCollapsed ? "w-[72px]" : "w-64"
        }`}
      >
        {desktopSidebar}
      </aside>

      {/* Phones and tablets: the same menu, in a drawer. A modal dialog keeps keyboard focus inside it. */}
      <dialog
        ref={drawerRef}
        aria-label="Menu"
        className="m-0 h-full max-h-none w-72 max-w-[85vw] bg-white p-0 backdrop:bg-slate-900/40 lg:hidden"
        onClick={(e) => {
          if (e.target === drawerRef.current) drawerRef.current?.close();
        }}
      >
        <button
          type="button"
          onClick={() => drawerRef.current?.close()}
          className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <X className="h-5 w-5" aria-hidden />
          <span className="sr-only">Close menu</span>
        </button>
        {mobileSidebar}
      </dialog>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button
            type="button"
            onClick={() => drawerRef.current?.showModal()}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            <Menu className="h-5 w-5" aria-hidden />
            <span className="max-w-[40vw] truncate">{storeDisplayName}</span>
            <span className="sr-only">: open menu</span>
            {ordersWaiting + reviewsWaiting > 0 ? <span aria-hidden className="h-2 w-2 rounded-full bg-amber-500" /> : null}
          </button>
          <div className="flex items-center gap-2">
            {viewShop}
            <DashboardBell slug={slug} refreshKey={pathname} />
          </div>
        </header>
        {/* relative: screen-reader-only text is positioned inside this scroll area, not the page, so the page never gets a second scrollbar. */}
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          <div className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mb-5 hidden items-center justify-end gap-2 lg:flex">
              {shareButton}
              {viewShop}
              <DashboardBell slug={slug} refreshKey={pathname} />
            </div>
            <p role="status" className="sr-only">
              {copied ? "Your shop link is copied." : ""}
            </p>
            {noticeBox}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

