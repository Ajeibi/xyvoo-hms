"use client";

import {
  useState,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ArrowUp,
  ArrowUpRight,
  BarChart2,
  BedDouble,
  Boxes,
  Building2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  FileText,
  Headphones,
  Home,
  Layers,
  LayoutTemplate,
  Menu,
  Newspaper,
  ShoppingBag,
  TrendingUp,
  User,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import type { NavItem, NavItemGroup } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { XYVOO_AUTH_ROUTES } from "@/constants/auth-links";
import {
  DesktopHeaderAuthMenus,
  MobileNavAuthSection,
} from "@/components/website/WebsiteHeaderAuthMenus";

import { LOGO_URL, LOGO_LIGHT_URL } from "@/constants/branding";
import { DEMO_BOOKING_HREF } from "@/constants/booking";
import type { IconType } from "react-icons";
import { FaFacebookF, FaLinkedinIn, FaXTwitter } from "react-icons/fa6";

const FOOTER_SOCIALS: { label: string; Icon: IconType }[] = [
  { label: "X", Icon: FaXTwitter },
  { label: "LinkedIn", Icon: FaLinkedinIn },
  { label: "Facebook", Icon: FaFacebookF },
];

function isNavGroup(item: NavItem): item is NavItemGroup {
  return "children" in item && Array.isArray(item.children);
}

/** Every marketing-site path that's part of the Storefront product flow --
 * not just the /solution/storefront landing page, but also its own
 * register/login pages and business-type pages -- so the header, brand CTA,
 * and footer all read as "XYVOO Storefront" (teal accent, own copy/links)
 * rather than defaulting to the generic multi-product look on those pages. */
const STOREFRONT_PATH_PREFIXES = [
  "/solution/storefront",
  "/register/storefront",
  "/auth/login/storefront",
  "/business-types/solo-sellers",
  "/business-types/growing-retailers",
  "/templates",
];

function isStorefrontPath(pathname: string | null): boolean {
  return STOREFRONT_PATH_PREFIXES.some((prefix) => pathname?.startsWith(prefix)) ?? false;
}

/** Storefront register/login pages keep the storefront branding but sit on a
 * white page with no hero, so the header must use its dark-on-light styling. */
const STOREFRONT_AUTH_PATH_PREFIXES = ["/register/storefront", "/auth/login/storefront"];

function isStorefrontAuthPath(pathname: string | null): boolean {
  return STOREFRONT_AUTH_PATH_PREFIXES.some((prefix) => pathname?.startsWith(prefix)) ?? false;
}

/** Pages whose hero runs up behind the header, so the header sits on the hero
 * (transparent) rather than as a separate white bar above it. Dark heroes also
 * switch the header to its light-on-dark styling. */
const DARK_HERO_PATHS = ["/pricing", "/blog", "/resources", "/support"];
const LIGHT_HERO_PATHS = ["/about", "/contact"];
const LIGHT_HERO_PATH_PREFIXES = ["/resources/", "/blog/"];

function isDarkHeroPath(pathname: string | null): boolean {
  return !!pathname && DARK_HERO_PATHS.includes(pathname);
}

function isLightHeroPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    LIGHT_HERO_PATHS.includes(pathname) ||
    LIGHT_HERO_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/** Same idea as STOREFRONT_PATH_PREFIXES, for the HMS product flow. */
const HMS_PATH_PREFIXES = [
  "/solution/hms",
  "/business-types/independent-hotels",
  "/business-types/hotel-groups",
];

function isHmsPath(pathname: string | null): boolean {
  return HMS_PATH_PREFIXES.some((prefix) => pathname?.startsWith(prefix)) ?? false;
}

/** Mobile sheet: full-width rows, light dividers, generous tap targets (Bumpa-style). */
const MOBILE_SHEET_ROW =
  "border-b border-border/70 px-5 py-4 transition-colors hover:bg-muted/40";

const MOBILE_SHEET_PARENT_TOGGLE =
  "flex w-full items-center justify-between gap-3 text-left text-base font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Top-level leaf links in the sheet (Home, Pricing, Contact). */
const MOBILE_SHEET_LEAF_ACTIVE =
  "bg-blue-50/90 text-xyvoo-blue hover:bg-blue-50";

/** Icon + tinted well for dropdown rows (keyed by href). Stroke uses same hue as the well, stronger for contrast. */
const NAV_DROPDOWN_ITEM_VISUAL: Record<
  string,
  { Icon: LucideIcon; iconWellStyle: CSSProperties; iconColor: string }
> = {
  "/solution/hms": {
    Icon: Building2,
    iconWellStyle: { background: "rgb(var(--xyvoo-blue-rgb) / 0.12)" },
    iconColor: "rgb(var(--xyvoo-blue-rgb) / 0.88)",
  },
  "/solution/storefront": {
    Icon: ShoppingBag,
    iconWellStyle: { background: "rgb(var(--xyvoo-mint-rgb) / 0.22)" },
    iconColor: "var(--xyvoo-teal-product)",
  },
  "/solution/storefront/customer-engagement": {
    Icon: Users,
    iconWellStyle: { background: "rgb(var(--xyvoo-mint-rgb) / 0.22)" },
    iconColor: "var(--xyvoo-teal-product)",
  },
  "/solution/storefront/payments": {
    Icon: CreditCard,
    iconWellStyle: { background: "rgb(var(--xyvoo-mint-rgb) / 0.22)" },
    iconColor: "var(--xyvoo-teal-product)",
  },
  "/templates#hotels": {
    Icon: LayoutTemplate,
    iconWellStyle: { background: "rgb(var(--xyvoo-blue-rgb) / 0.12)" },
    iconColor: "rgb(var(--xyvoo-blue-rgb) / 0.88)",
  },
  "/templates#storefronts": {
    Icon: LayoutTemplate,
    iconWellStyle: { background: "rgb(var(--xyvoo-mint-rgb) / 0.22)" },
    iconColor: "var(--xyvoo-teal-product)",
  },
  "/solution/storefront/inventory": {
    Icon: Boxes,
    iconWellStyle: { background: "rgb(var(--xyvoo-mint-rgb) / 0.22)" },
    iconColor: "var(--xyvoo-teal-product)",
  },
  "/solution/hms/guest-experience": {
    Icon: BedDouble,
    iconWellStyle: { background: "rgb(var(--xyvoo-blue-rgb) / 0.12)" },
    iconColor: "rgb(var(--xyvoo-blue-rgb) / 0.88)",
  },
  "/solution/hms/operations": {
    Icon: Wrench,
    iconWellStyle: { background: "rgb(var(--xyvoo-blue-rgb) / 0.12)" },
    iconColor: "rgb(var(--xyvoo-blue-rgb) / 0.88)",
  },
  "/solution/hms/finance-analytics": {
    Icon: BarChart2,
    iconWellStyle: { background: "rgb(var(--xyvoo-blue-rgb) / 0.12)" },
    iconColor: "rgb(var(--xyvoo-blue-rgb) / 0.88)",
  },
  "/business-types/independent-hotels": {
    Icon: Home,
    iconWellStyle: { background: "rgb(var(--xyvoo-blue-rgb) / 0.12)" },
    iconColor: "rgb(var(--xyvoo-blue-rgb) / 0.88)",
  },
  "/business-types/hotel-groups": {
    Icon: Layers,
    iconWellStyle: { background: "rgb(var(--xyvoo-blue-rgb) / 0.12)" },
    iconColor: "rgb(var(--xyvoo-blue-rgb) / 0.88)",
  },
  "/business-types/solo-sellers": {
    Icon: User,
    iconWellStyle: { background: "rgb(var(--xyvoo-mint-rgb) / 0.22)" },
    iconColor: "var(--xyvoo-teal-product)",
  },
  "/business-types/growing-retailers": {
    Icon: TrendingUp,
    iconWellStyle: { background: "rgb(var(--xyvoo-mint-rgb) / 0.22)" },
    iconColor: "var(--xyvoo-teal-product)",
  },
  "/blog": {
    Icon: Newspaper,
    iconWellStyle: { background: "rgb(var(--xyvoo-blue-rgb) / 0.09)" },
    iconColor: "rgb(var(--xyvoo-blue-rgb) / 0.82)",
  },
  "/resources": {
    Icon: FileText,
    iconWellStyle: { background: "rgb(var(--xyvoo-mint-rgb) / 0.18)" },
    iconColor: "var(--xyvoo-teal-product)",
  },
  "/support": {
    Icon: Headphones,
    iconWellStyle: { background: "rgb(var(--xyvoo-mint-rgb) / 0.14)" },
    iconColor: "var(--xyvoo-teal-product)",
  },
};

const NAV: NavItem[] = [
  {
    label: "Solutions",
    children: [
      {
        label: "Hotel Management System",
        href: "/solution/hms",
        description:
          "Front desk, housekeeping, F&B and finance in one dashboard for your property.",
      },
      {
        label: "Guest Experience",
        href: "/solution/hms/guest-experience",
        description:
          "Rooms, reservations and front office: the guest-facing side of your property.",
      },
      {
        label: "Operations & Facilities",
        href: "/solution/hms/operations",
        description:
          "Housekeeping, maintenance and procurement, kept in sync.",
      },
      {
        label: "Finance, HR & Analytics",
        href: "/solution/hms/finance-analytics",
        description:
          "Staff, F&B revenue, billing and reporting, all accounted for.",
      },
      {
        label: "Hotel Website Templates",
        href: "/templates#hotels",
        description:
          "See your hotel website: rooms, availability and booking requests.",
      },
      {
        label: "XYVOO Storefront",
        href: "/solution/storefront",
        description:
          "Branded storefront, catalog, checkout, and fulfilment without bolt-ons.",
      },
      {
        label: "Customer Engagement",
        href: "/solution/storefront/customer-engagement",
        description:
          "Segments, loyalty points, back-in-stock alerts, abandoned cart recovery and referrals.",
      },
      {
        label: "Payments & Gift Cards",
        href: "/solution/storefront/payments",
        description:
          "Paystack checkout, gift cards, and receipts, without a separate payment tool.",
      },
      {
        label: "Inventory & Wholesale",
        href: "/solution/storefront/inventory",
        description:
          "Bundles, barcodes, and wholesale pricing with minimum and maximum order quantities.",
      },
      {
        label: "Storefront Website Templates",
        href: "/templates#storefronts",
        description:
          "See what your storefront website could look like, page by page.",
      },
    ],
  },
  {
    label: "Business Types",
    children: [
      {
        label: "Independent Hotels",
        href: "/business-types/independent-hotels",
        description:
          "A single property, running on one simple system, with no back office required.",
      },
      {
        label: "Hotel Groups & Multi-Property",
        href: "/business-types/hotel-groups",
        description:
          "Reservations, staff and reporting across every property, in one connected view.",
      },
      {
        label: "Solo Sellers & New Businesses",
        href: "/business-types/solo-sellers",
        description:
          "A storefront, catalogue and checkout you can run by yourself, live the same day.",
      },
      {
        label: "Growing Retailers",
        href: "/business-types/growing-retailers",
        description:
          "Marketing, team access and reporting that scale alongside your storefront.",
      },
    ],
  },
  {
    label: "Learn",
    children: [
      {
        label: "Blog",
        href: "/blog",
        description: "Product news, guides, and hospitality reads.",
      },
      {
        label: "Resources",
        href: "/resources",
        description: "Downloadable guides and checklists, ready to print or share.",
      },
      {
        label: "Support",
        href: "/support",
        description: "Help articles, FAQs, and how to get unstuck.",
      },
    ],
  },
  { label: "About", href: "/about" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
];

function MobileNavSidebar({ pathname }: { pathname: string }) {
  const { openMobile, setOpenMobile } = useSidebar();
  /** At most one nav group expanded at a time (accordion). */
  const [expandedGroupLabel, setExpandedGroupLabel] = useState<string | null>(
    null,
  );

  const close = () => {
    setExpandedGroupLabel(null);
    setOpenMobile(false);
  };

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset sheet + accordion when pathname changes */
    setOpenMobile(false);
    setExpandedGroupLabel(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pathname, setOpenMobile]);

  const handleSheetOpenChange = (open: boolean) => {
    setOpenMobile(open);
    if (!open) setExpandedGroupLabel(null);
  };

  const toggleGroup = (label: string) => {
    setExpandedGroupLabel((prev) => (prev === label ? null : label));
  };

  return (
    <Sheet open={openMobile} onOpenChange={handleSheetOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="z-[60] flex min-h-0 flex-col gap-0 overflow-hidden border-0 bg-sidebar p-0 text-sidebar-foreground shadow-xl ring-0 data-[side=right]:w-full data-[side=right]:max-w-none data-[side=right]:sm:max-w-none [&>button]:hidden"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription>Site navigation</SheetDescription>
        </SheetHeader>
        <SidebarHeader className="shrink-0 border-0 border-b border-border/70 p-5 pb-4">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" onClick={close} className="flex min-w-0 items-center">
              <Image src={LOGO_URL} alt="XYVOO" width={125} height={50} />
            </Link>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="shrink-0 rounded-lg p-2 text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-6" strokeWidth={2} />
            </button>
          </div>
        </SidebarHeader>
      <SidebarContent className="min-h-0 flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        {NAV.map((item) =>
          isNavGroup(item) ? (
            <SidebarGroup key={item.label} className="p-0">
              <SidebarGroupContent className="px-0">
                <button
                  type="button"
                  className={cn(
                    MOBILE_SHEET_ROW,
                    MOBILE_SHEET_PARENT_TOGGLE,
                    "hover:bg-muted/45",
                  )}
                  aria-expanded={expandedGroupLabel === item.label}
                  onClick={() => toggleGroup(item.label)}
                >
                  <span>{item.label}</span>
                  {expandedGroupLabel === item.label ? (
                    <ChevronUp className="size-4 shrink-0 opacity-60" aria-hidden />
                  ) : (
                    <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
                  )}
                </button>
                {expandedGroupLabel === item.label ? (
                  <ul
                    role="list"
                    className="divide-y divide-border/55 border-b border-border/70 bg-muted/15"
                  >
                    {item.children.map((c) => {
                      const active = pathname === c.href;
                      const visual = NAV_DROPDOWN_ITEM_VISUAL[c.href];
                      return (
                        <li key={c.href}>
                          <Link
                            href={c.href}
                            onClick={close}
                            className={cn(
                              "flex w-full items-start gap-4 px-5 py-4 pl-9 text-left transition-colors hover:bg-muted/35 active:bg-muted/45",
                              active && "bg-blue-50/70",
                            )}
                          >
                            {visual ? (
                              <span
                                className="flex size-10 shrink-0 items-center justify-center rounded-full"
                                style={visual.iconWellStyle}
                              >
                                <visual.Icon
                                  className="size-[18px]"
                                  style={{ color: visual.iconColor }}
                                  strokeWidth={2}
                                  aria-hidden
                                />
                              </span>
                            ) : null}
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                              <span
                                className={cn(
                                  "text-[15px] font-semibold leading-snug",
                                  active ? "text-xyvoo-blue" : "text-foreground",
                                )}
                              >
                                {c.label}
                              </span>
                              {c.description ? (
                                <span
                                  className="text-[13px] font-normal leading-snug text-muted-foreground"
                                >
                                  {c.description}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </SidebarGroupContent>
            </SidebarGroup>
          ) : (
            <SidebarGroup key={item.href} className="p-0">
              <SidebarGroupContent className="px-0">
                <Link
                  href={item.href}
                  onClick={close}
                  className={cn(
                    MOBILE_SHEET_ROW,
                    "flex w-full items-center text-base font-semibold",
                    pathname === item.href
                      ? MOBILE_SHEET_LEAF_ACTIVE
                      : "text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              </SidebarGroupContent>
            </SidebarGroup>
          ),
        )}
        <MobileNavAuthSection
          onNavigate={close}
          pathname={pathname}
          expandedSection={expandedGroupLabel}
          onToggleSection={toggleGroup}
        />
      </SidebarContent>
      </SheetContent>
    </Sheet>
  );
}

const NAV_DROPDOWN_HOVER_CLOSE_MS = 140;

function NavGroupDropdown({
  item,
  pathname,
  isHeroDark = false,
}: {
  item: NavItemGroup;
  pathname: string;
  isHeroDark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelScheduledClose = () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, NAV_DROPDOWN_HOVER_CLOSE_MS);
  };

  useEffect(() => () => cancelScheduledClose(), []);

  const childActive = item.children.some((c) => pathname === c.href);
  const isStorefront = isStorefrontPath(pathname);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger
        type="button"
        className={cn(
          "group flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium outline-none transition-all duration-200 ease-out data-[state=open]:text-foreground",
          isHeroDark
            ? childActive
              ? "bg-white/10 text-white hover:bg-white/20"
              : "text-white/80 hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10 data-[state=open]:text-white"
            : childActive
              ? isStorefront
                // Teal background, but deep green (not teal) text/chevron —
                // reusing the same #04140f as the storefront hero/footer.
                ? "bg-teal-50 text-[#04140f] hover:bg-teal-100/90"
                : "bg-blue-50 text-xyvoo-blue hover:bg-blue-100/90"
              : "text-foreground hover:bg-muted/80 hover:text-xyvoo-blue data-[state=open]:bg-muted/70"
        )}
        onPointerEnter={() => {
          cancelScheduledClose();
          setOpen(true);
        }}
        onPointerLeave={scheduleClose}
      >
        {item.label}
        <ChevronDown className="size-3.5 shrink-0 opacity-70 transition-transform duration-200 ease-out group-data-[state=open]:-rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className={cn(
          "rounded-xl border-0 bg-white p-2 text-foreground ring-0 data-[side=bottom]:slide-in-from-top-2",
          // Long menus (e.g. Solutions) split into two columns so they fit
          // without scrolling; short menus stay a single column.
          item.children.length > 5
            ? "grid w-[min(calc(100vw-1.5rem),48rem)] max-w-none grid-flow-col grid-cols-2 gap-x-1"
            : "min-w-[360px] max-w-[min(calc(100vw-1.5rem),26rem)] w-max"
        )}
        style={{
          ...(item.children.length > 5 && {
            // Fill column-first so related groups (HMS, then Storefront) stack together.
            gridTemplateRows: `repeat(${Math.ceil(item.children.length / 2)}, auto)`,
          }),
          border: "1px solid rgb(var(--xyvoo-blue-rgb) / 0.1)",
          boxShadow:
            "0 16px 48px -12px rgb(var(--xyvoo-navy-rgb) / 0.22), 0 4px 16px rgb(var(--xyvoo-navy-rgb) / 0.08)",
        }}
        onPointerEnter={() => {
          cancelScheduledClose();
          setOpen(true);
        }}
        onPointerLeave={scheduleClose}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {item.children.map((c) => {
          const active = pathname === c.href;
          const visual = NAV_DROPDOWN_ITEM_VISUAL[c.href];
          const Icon = visual?.Icon;
          return (
            <DropdownMenuItem
              key={c.href}
              asChild
              className="cursor-pointer rounded-xl px-1 py-0.5 text-foreground focus:bg-muted/70 data-[highlighted]:bg-muted/70"
            >
              <Link
                href={c.href}
                className="flex items-start gap-5 px-2 py-2.5 outline-none [&:focus-visible]:ring-0"
              >
                {Icon ? (
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-full"
                    style={visual.iconWellStyle}
                  >
                    <Icon
                      className="size-[18px]"
                      style={{ color: visual.iconColor }}
                      strokeWidth={2}
                      aria-hidden
                    />
                  </span>
                ) : null}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                  <span
                    className={`text-sm font-semibold leading-snug ${
                      active ? "text-xyvoo-blue" : "text-foreground"
                    }`}
                  >
                    {c.label}
                  </span>
                  {c.description ? (
                    <span
                      className="text-[11px] font-normal leading-[1.45]"
                      style={{
                        color: "var(--xyvoo-navy-muted-text)",
                      }}
                    >
                      {c.description}
                    </span>
                  ) : null}
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WebsiteHeader({ pathname }: { pathname: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [visible, setVisible] = useState(true);
  const [heroTheme, setHeroTheme] = useState<{ isDark: boolean; bg: string; id: string } | null>(null);
  const lastScrollY = useRef(0);
  const { openMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    const onScroll = () => {
      const currentScrollY = window.scrollY;
      setScrolled(currentScrollY > 20);

      // Hide on scroll down, show on scroll up
      if (currentScrollY > lastScrollY.current && currentScrollY > 120) {
        setVisible(false);
      } else {
        setVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setHeroTheme(detail);
    };
    window.addEventListener("heroThemeChange", handleThemeChange);
    // Request current theme on mount
    window.dispatchEvent(new CustomEvent("requestHeroTheme"));
    return () => window.removeEventListener("heroThemeChange", handleThemeChange);
  }, []);

  const isStorefront = isStorefrontPath(pathname);
  const isStorefrontAuth = isStorefrontAuthPath(pathname);
  const isStorefrontHero = isStorefront && !isStorefrontAuth;
  // The auth pages pin their image below the header (top-[76px]), so hiding
  // the header on scroll would leave an empty strip above it.
  const shown = visible || isStorefrontAuth;
  const isSolutionHmsPath = isHmsPath(pathname);

  const isDarkHero = isDarkHeroPath(pathname);
  const isHeroDark = !scrolled && (
    (pathname === "/" && !!heroTheme?.isDark) ||
    isSolutionHmsPath ||
    isStorefrontHero ||
    isDarkHero
  );
  const sitsOnHero =
    (pathname === "/" && !!heroTheme) ||
    isSolutionHmsPath ||
    isStorefrontHero ||
    isDarkHero ||
    isLightHeroPath(pathname);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 transform",
        shown ? "translate-y-0" : "-translate-y-full",
        scrolled
          ? "bg-white/95 backdrop-blur-md shadow-sm"
          : sitsOnHero
            ? "bg-transparent"
            : "bg-white/90 backdrop-blur-sm"
      )}
    >
      <div
        className={cn(
          "w-full transition-shadow duration-300",
          scrolled ? "shadow-[var(--xyvoo-shadow-header-scrolled)]" : ""
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/" className="group flex shrink-0 items-center">
            <Image
              src={isHeroDark ? LOGO_LIGHT_URL : LOGO_URL}
              alt="XYVOO"
              width={isHeroDark ? 122 : 125}
              height={50}
              className="transition-all duration-200"
              style={{ width: "auto", height: "auto" }}
            />
          </Link>
          <nav className="hidden min-[1024px]:flex flex-1 justify-center gap-1">
            {NAV.map((item) =>
              isNavGroup(item) ? (
                <NavGroupDropdown
                  key={item.label}
                  item={item}
                  pathname={pathname}
                  isHeroDark={isHeroDark}
                />
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ease-out",
                    isHeroDark
                      ? pathname === item.href
                        ? "bg-white/10 text-white hover:bg-white/20"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                      : pathname === item.href
                        ? "bg-blue-50 text-xyvoo-blue hover:bg-blue-100/90"
                        : "text-foreground hover:bg-muted/80 hover:text-xyvoo-blue"
                  )}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden min-[700px]:flex items-center gap-2">
              <DesktopHeaderAuthMenus isHeroDark={isHeroDark} isStorefront={isStorefront} />
            </div>
            <button
              type="button"
              className={cn(
                "flex min-[1024px]:hidden rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isHeroDark
                  ? "text-white hover:bg-white/10"
                  : "text-foreground hover:bg-muted/60"
              )}
              aria-label={openMobile ? "Close menu" : "Open menu"}
              aria-expanded={openMobile}
              onClick={() => setOpenMobile(!openMobile)}
            >
              <Menu className="size-6" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function WebsiteLayout({
  children,
  compactMain = false,
}: {
  children: ReactNode;
  /** When true, main does not grow to fill the viewport (short auth-style pages). */
  compactMain?: boolean;
}) {
  const pathname = usePathname();
  const isStorefront = isStorefrontPath(pathname);

  return (
    <SidebarProvider className="min-h-screen w-full min-w-0 flex-col overflow-x-clip bg-background font-sans text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-xyvoo-navy focus:shadow-lg"
      >
        Skip to content
      </a>
      <WebsiteHeader key={pathname} pathname={pathname} />
      <MobileNavSidebar pathname={pathname} />

      <main id="main-content" className={cn("min-w-0", !compactMain && "flex-1")}>{children}</main>

      {!compactMain && <BrandCtaSection />}

      <footer
        className={cn(
          "mt-0 overflow-hidden px-6 pt-16 text-white md:pt-20",
          // Same dark teal-green as the storefront hero and growth-stack
          // section (#04140f), so the footer reads as part of the same
          // product rather than borrowing HMS's navy.
          isStorefront ? "bg-[#04140f]" : "bg-xyvoo-navy"
        )}
      >
        <div className="mx-auto max-w-[1200px]">
          {/* Heading + CTA (left) and link columns + contact (right) */}
          <div className="grid grid-cols-1 gap-12 border-b border-white/10 pb-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)] lg:gap-16">
            <div className="max-w-md">
              <h2 className="text-h2 font-black leading-[1.08] tracking-tight text-white">
                Built to help you{" "}
                <span
                  className={cn(
                    "underline decoration-2 underline-offset-4",
                    isStorefront ? "text-xyvoo-teal-product" : "text-xyvoo-blue-light"
                  )}
                >
                  grow
                </span>
                .
              </h2>
              <p className="mt-4 max-w-sm text-p leading-relaxed text-slate-400">
                Whether you&apos;re launching your first property or scaling
                your online storefront, XYVOO gives you the tools to get set up,
                go live, and grow faster.
              </p>
              <a
                href="mailto:hello@getxyvoo.com"
                className="group mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-xs font-bold uppercase tracking-widest text-xyvoo-navy transition-colors hover:bg-slate-100"
              >
                hello@getxyvoo.com
                <ArrowUpRight
                  className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={2.5}
                />
              </a>
              <div className="flex gap-3 mt-8">
                {FOOTER_SOCIALS.map(({ label, Icon }) => (
                  <div
                    key={label}
                    role="img"
                    aria-label={label}
                    title={label}
                    className={cn(
                      "w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-slate-300 cursor-pointer transition-colors hover:text-white",
                      isStorefront ? "hover:bg-xyvoo-teal-product-hover" : "hover:bg-xyvoo-blue"
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
              {[
                {
                  title: "Product",
                  links: [
                    ["Solution: HMS", "/solution/hms"],
                    ["Solution: Storefront", "/solution/storefront"],
                    ["Website templates", "/templates"],
                    ["Pricing", "/pricing"],
                    ["Get started: HMS", XYVOO_AUTH_ROUTES.hms.register],
                    ["Get started: Storefront", XYVOO_AUTH_ROUTES.storefront.register],
                  ],
                },
                {
                  title: "Learn",
                  links: [
                    ["Blog", "/blog"],
                    ["Resources", "/resources"],
                    ["Support", "/support"],
                  ],
                },
                {
                  title: "Company",
                  links: [
                    ["About", "/about"],
                    ["Contact", "/contact"],
                  ],
                },
              ].map((col) => (
                <div key={col.title}>
                  <p className="text-eyebrow font-semibold text-slate-500 uppercase tracking-widest mb-4">
                    {col.title}
                  </p>
                  <ul className="space-y-2.5">
                    {col.links.map(([label, href]) => (
                      <li key={label}>
                        <Link
                          href={href}
                          className="text-sm text-slate-400 hover:text-white transition-colors"
                        >
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div>
                <p className="text-eyebrow font-semibold text-slate-500 uppercase tracking-widest mb-4">
                  Get in touch
                </p>
                <ul className="space-y-2.5">
                  <li>
                    <a
                      href="mailto:hello@getxyvoo.com"
                      className="text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      hello@getxyvoo.com
                    </a>
                  </li>
                  <li>
                    <a
                      href="tel:+2348009986661"
                      className="text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      +234 800 998 6661
                    </a>
                  </li>
                  <li className="pt-1">
                    <Link
                      href={DEMO_BOOKING_HREF}
                      className={cn(
                        "inline-flex items-center gap-1 text-sm font-semibold transition-colors",
                        isStorefront
                          ? "text-xyvoo-teal-product hover:text-xyvoo-teal-product-hover"
                          : "text-xyvoo-blue-light hover:text-xyvoo-blue"
                      )}
                    >
                      Book a call
                      <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Oversized wordmark + logo/tagline */}
          <div className="flex flex-col items-start justify-between gap-8 py-12 md:flex-row md:items-center md:py-14">
            <span
              aria-hidden
              className="select-none text-[clamp(3rem,13vw,8.5rem)] font-extrabold leading-none tracking-tight text-white/[0.06]"
            >
              XYVOO
            </span>
            <div className="flex shrink-0 items-center gap-4">
              <Image
                src={LOGO_LIGHT_URL}
                alt="XYVOO"
                width={110}
                height={44}
                style={{ width: "auto", height: "auto" }}
              />
              <p className="max-w-[220px] text-xs leading-relaxed text-slate-500">
                One company, two platforms, built for businesses across
                Africa.
              </p>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 py-6 md:flex-row">
            <p className="text-xs text-slate-500">
              © 2026 XYVOO Technologies Ltd. All rights reserved.
            </p>
            <div className="flex items-center gap-5">
              <Link
                href="/privacy"
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Terms of Service
              </Link>
              <Link
                href="/privacy"
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Cookie Policy
              </Link>
            </div>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500 transition-colors hover:text-white"
            >
              Back to top
              <ArrowUp className="size-3.5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </footer>
    </SidebarProvider>
  );
}

/** Parallax matches the "Call to Action Background Strip" component from
 * the senior-umbraco Litho theme: background drifts at half scroll speed
 * (ratio 0.5) via a transform (not background-position, since this is a
 * Next <Image>), disabled below the same 1050px breakpoint. The reveal is
 * a plain CSS fade-in-on-mount (see the <style> block below) rather than
 * an IntersectionObserver gate — that avoids a hard failure mode where a
 * JS/observer hiccup would leave the whole section stuck at opacity 0. */
const PARALLAX_RATIO = 0.5;
const PARALLAX_MIN_WIDTH = 1050;
const PARALLAX_MAX_PX = 80;

/** Each product's own dark shade for the CTA strip's fallback background
 * and overlay tint — HMS's hero navy vs storefront's hero teal-green —
 * so the two keep reading as separate products rather than sharing one
 * generic dark colour. */
const CTA_BG_COLOR: Record<"hms" | "storefront", string> = {
  hms: "#000d1f",
  storefront: "#04140f",
};

function BrandCtaSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const parallaxRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isHms = isHmsPath(pathname);
  const isStorefront = isStorefrontPath(pathname);
  const isImageBg = isHms || isStorefront;
  // Sub-pages (e.g. /solution/hms/guest-experience) get a second button
  // pointing back at the main solution page — but the main solution pages
  // themselves must not link to themselves, so they keep the single-button
  // layout they always had.
  const isHmsSubPage = isHms && pathname !== "/solution/hms";
  const isStorefrontSubPage = isStorefront && pathname !== "/solution/storefront";
  const bgColor = isHms ? CTA_BG_COLOR.hms : CTA_BG_COLOR.storefront;
  const [imageOk, setImageOk] = useState(true);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play().catch((err) => {
        console.warn("Video autoplay failed:", err);
      });
    }
  }, []);

  // Reset the "did the image fail" flag when switching between HMS and
  // Storefront (they share the (home) layout, so client-side nav between
  // them doesn't remount this component). Deferred to a callback rather
  // than calling setState synchronously in the effect body.
  useEffect(() => {
    const id = requestAnimationFrame(() => setImageOk(true));
    return () => cancelAnimationFrame(id);
  }, [isHms, isStorefront]);

  // Background parallax: the image drifts at half scroll speed relative to
  // the foreground, disabled on narrow viewports — same mechanics as the
  // Litho `.parallax` plugin, ported to a transform on an oversized image
  // wrapper instead of an inline `background-position`.
  useEffect(() => {
    if (!isImageBg) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let ticking = false;

    function update() {
      const el = parallaxRef.current;
      if (!el) return;
      if (window.innerWidth <= PARALLAX_MIN_WIDTH) {
        el.style.transform = "";
        return;
      }
      const rect = el.getBoundingClientRect();
      const centerOffset = rect.top + rect.height / 2 - window.innerHeight / 2;
      const y = Math.max(-PARALLAX_MAX_PX, Math.min(PARALLAX_MAX_PX, -centerOffset * PARALLAX_RATIO));
      el.style.transform = `translateY(${y}px)`;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [isImageBg]);

  return (
    <section
      aria-labelledby="brand-cta-heading"
      className={cn(
        "relative overflow-hidden w-full text-white py-16 md:py-20 px-6 lg:px-12 border-t border-white/5",
        isImageBg && "cta-bg-strip-fade-in"
      )}
      style={isImageBg ? { backgroundColor: bgColor } : undefined}
    >
      {/* HMS and Storefront each get a still image background with a
          parallax drift and a dark overlay tint in their own product
          colour (the Umbraco CTA strip's effect); every other page keeps
          the original shared video, unchanged. */}
      {isImageBg ? (
        <>
          {imageOk && (
            <div
              ref={parallaxRef}
              className="absolute -inset-y-24 inset-x-0 z-0 will-change-transform"
            >
              <Image
                src={
                  isHms
                    ? "/images/background%20images/receptionBg.png"
                    : "/images/background%20images/storefront-background%20strip.png"
                }
                alt=""
                fill
                sizes="100vw"
                className="object-cover"
                priority={false}
                onError={() => setImageOk(false)}
              />
            </div>
          )}
          <div
            className="absolute inset-0 z-[1]"
            style={{ backgroundColor: bgColor, opacity: 0.55 }}
            aria-hidden
          />
          <style>{`
            @keyframes ctaBgStripFadeIn {
              from { opacity: 0; transform: translateY(14px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .cta-bg-strip-fade-in {
              animation: ctaBgStripFadeIn 0.8s ease-out both;
            }
            @media (prefers-reduced-motion: reduce) {
              .cta-bg-strip-fade-in { animation: none; opacity: 1; }
            }
          `}</style>
        </>
      ) : (
        <video
          ref={videoRef}
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
        >
          <source
            src="/images/background%20images/animated_brandCTA_1920x350_h264.mp4"
            type="video/mp4"
          />
        </video>
      )}

      <div className="relative z-10 mx-auto max-w-[1200px] w-full flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex flex-col text-left max-w-2xl">
          <h4 id="brand-cta-heading" className="text-h4 font-bold tracking-tight text-white leading-tight">
            {isHms
              ? "Ready to run your property on XYVOO?"
              : isStorefront
                ? "Ready to run your business on your own storefront?"
                : "Ready to see it running your business?"}
          </h4>
          <p className="mt-2 text-p text-slate-300 leading-relaxed">
            {isHms
              ? "Start free or compare HMS plans. Our team can help you migrate without downtime."
              : isStorefront
                ? "Free plan available for Storefront. No credit card required to start."
                : "14-day free trial for HMS. Free plan available for Storefront. No credit card required to start."}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto shrink-0">
          <Link
            href={isStorefront ? "/register/storefront" : "/register"}
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-lg text-white px-6 py-3 text-[14.5px] font-semibold transition-all duration-200 hover:-translate-y-0.5 shadow-sm w-full sm:w-auto text-center",
              isStorefront
                ? "bg-xyvoo-teal-product-hover hover:opacity-92"
                : "bg-xyvoo-blue hover:bg-xyvoo-blue/90"
            )}
          >
            {isHms || isStorefront ? "Get started →" : "Launch your HMS →"}
          </Link>
          {(isHmsSubPage || isStorefrontSubPage || (!isHms && !isStorefront)) && (
            <Link
              href={isHmsSubPage ? "/solution/hms" : isStorefrontSubPage ? "/solution/storefront" : "/register/storefront"}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/30 bg-white/10 hover:bg-white/20 text-white px-6 py-3 text-[14.5px] font-semibold transition-all duration-200 hover:-translate-y-0.5 shadow-sm w-full sm:w-auto text-center"
            >
              {isHmsSubPage ? "Explore HMS →" : isStorefrontSubPage ? "Explore Storefront →" : "Start your online storefront →"}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
