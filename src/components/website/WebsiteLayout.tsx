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
  Briefcase,
  Building2,
  ChevronDown,
  ChevronUp,
  Headphones,
  Info,
  Menu,
  Newspaper,
  ShoppingBag,
  Users,
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

import { LOGO_URL } from "@/constants/branding";

function isNavGroup(item: NavItem): item is NavItemGroup {
  return "children" in item && Array.isArray(item.children);
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
  "/home/solutions/hotel": {
    Icon: Building2,
    iconWellStyle: { background: "rgb(var(--xyvoo-blue-rgb) / 0.12)" },
    iconColor: "rgb(var(--xyvoo-blue-rgb) / 0.88)",
  },
  "/home/solutions/store": {
    Icon: ShoppingBag,
    iconWellStyle: { background: "rgb(var(--xyvoo-mint-rgb) / 0.22)" },
    iconColor: "var(--xyvoo-teal-product)",
  },
  "/home/about": {
    Icon: Info,
    iconWellStyle: { background: "rgb(var(--xyvoo-blue-rgb) / 0.08)" },
    iconColor: "rgb(var(--xyvoo-blue-rgb) / 0.82)",
  },
  "/home/team": {
    Icon: Users,
    iconWellStyle: { background: "rgb(var(--xyvoo-mint-rgb) / 0.16)" },
    iconColor: "var(--xyvoo-teal-product-hover)",
  },
  "/home/careers": {
    Icon: Briefcase,
    iconWellStyle: { background: "rgb(var(--xyvoo-blue-rgb) / 0.1)" },
    iconColor: "rgb(var(--xyvoo-blue-rgb) / 0.85)",
  },
  "/home/blog": {
    Icon: Newspaper,
    iconWellStyle: { background: "rgb(var(--xyvoo-blue-rgb) / 0.09)" },
    iconColor: "rgb(var(--xyvoo-blue-rgb) / 0.82)",
  },
  "/home/support": {
    Icon: Headphones,
    iconWellStyle: { background: "rgb(var(--xyvoo-mint-rgb) / 0.14)" },
    iconColor: "var(--xyvoo-teal-product)",
  },
};

const NAV: NavItem[] = [
  { label: "Home", href: "/home" },
  {
    label: "Solutions",
    children: [
      {
        label: "Hotel Management System",
        href: "/home/solutions/hotel",
        description:
          "Front desk, housekeeping, F&B, and finance — one dashboard for your property.",
      },
      {
        label: "XYVOO Store",
        href: "/home/solutions/store",
        description:
          "Branded storefront, catalog, checkout, and fulfilment without bolt-ons.",
      },
    ],
  },
  {
    label: "Company",
    children: [
      {
        label: "About Us",
        href: "/home/about",
        description: "Our story, mission, and why we build for hoteliers.",
      },
      {
        label: "Our Team",
        href: "/home/team",
        description: "Meet the people shipping XYVOO across Africa.",
      },
      {
        label: "Careers",
        href: "/home/careers",
        description: "Open roles and how we work together.",
      },
    ],
  },
  {
    label: "Resources",
    children: [
      {
        label: "Blog",
        href: "/home/blog",
        description: "Product news, guides, and hospitality reads.",
      },
      {
        label: "Support",
        href: "/home/support",
        description: "Help articles, FAQs, and how to get unstuck.",
      },
    ],
  },
  { label: "Pricing", href: "/home/pricing" },
  { label: "Contact", href: "/home/contact" },
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
        className="z-[60] flex min-h-0 flex-col gap-0 overflow-hidden border-0 bg-sidebar p-0 text-sidebar-foreground shadow-xl ring-0 data-[side=right]:w-[75vw] data-[side=right]:max-w-none data-[side=right]:sm:max-w-none [&>button]:hidden"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription>Site navigation</SheetDescription>
        </SheetHeader>
        <SidebarHeader className="shrink-0 border-0 border-b border-border/70 p-5 pb-4">
          <div className="flex items-center justify-between gap-3">
            <Link href="/home" onClick={close} className="flex min-w-0 items-center">
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
}: {
  item: NavItemGroup;
  pathname: string;
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

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger
        type="button"
        className={`group flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium outline-none transition-all duration-200 ease-out hover:bg-muted/80 hover:text-xyvoo-blue data-[state=open]:bg-muted/70 data-[state=open]:text-foreground ${
          childActive
            ? "bg-blue-50 text-xyvoo-blue hover:bg-blue-100/90"
            : "text-foreground"
        }`}
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
        className="min-w-[360px] max-w-[min(calc(100vw-1.5rem),26rem)] w-max rounded-xl border-0 bg-white p-2 text-foreground ring-0 data-[side=bottom]:slide-in-from-top-2"
        style={{
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
  const { openMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-white/95 backdrop-blur-md" : "bg-white/90 backdrop-blur-sm"
      }`}
    >
      <div
        className={`mx-auto w-full max-w-[1800px] transition-shadow duration-300 ${
          scrolled ? "shadow-[var(--xyvoo-shadow-header-scrolled)]" : ""
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/home" className="group flex shrink-0 items-center">
            <Image src={LOGO_URL} alt="XYVOO" width={125} height={50} />
          </Link>
          <nav className="hidden min-[1024px]:flex flex-1 justify-center gap-1">
            {NAV.map((item) =>
              isNavGroup(item) ? (
                <NavGroupDropdown
                  key={item.label}
                  item={item}
                  pathname={pathname}
                />
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ease-out ${
                    pathname === item.href
                      ? "bg-blue-50 text-xyvoo-blue hover:bg-blue-100/90"
                      : "text-foreground hover:bg-muted/80 hover:text-xyvoo-blue"
                  }`}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden min-[700px]:flex items-center gap-2">
              <DesktopHeaderAuthMenus />
            </div>
            <button
              type="button"
              className="flex min-[1024px]:hidden rounded-lg p-2 text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

  return (
    <SidebarProvider className="min-h-screen w-full min-w-0 flex-col overflow-x-clip bg-background font-sans text-foreground">
      <WebsiteHeader key={pathname} pathname={pathname} />
      <MobileNavSidebar pathname={pathname} />

      <main className={cn("min-w-0", !compactMain && "flex-1")}>{children}</main>

      <footer className="bg-xyvoo-navy mt-0 px-6 py-16 text-white">
        <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <Image
              src={LOGO_URL}
              alt="XYVOO"
              width={125}
              height={50}
              className="mb-4 brightness-0 invert"
            />
            <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
              The modern Hotel Management System built for independent
              properties across Africa.
            </p>
            <div className="flex gap-3 mt-5">
              {["𝕏", "in", "f"].map((s) => (
                <div
                  key={s}
                  className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold text-slate-300 cursor-pointer transition-colors hover:bg-xyvoo-blue"
                >
                  {s}
                </div>
              ))}
            </div>
          </div>

          {[
            {
              title: "Product",
              links: [
                ["Features", "/home"],
                ["Pricing", "/home/pricing"],
                ["Get started — HMS", XYVOO_AUTH_ROUTES.hms.register],
                ["Get started — Store", XYVOO_AUTH_ROUTES.store.register],
              ],
            },
            {
              title: "Company",
              links: [
                ["About", "/home/about"],
                ["Team", "/home/team"],
                ["Careers", "/home/careers"],
              ],
            },
            {
              title: "Resources",
              links: [
                ["Blog", "/home/blog"],
                ["Support", "/home/support"],
                ["Contact", "/home/contact"],
              ],
            },
          ].map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
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
        </div>
        <div className="mx-auto mt-12 flex max-w-[1800px] flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 md:flex-row">
          <p className="text-xs text-slate-500">
            © 2026 XYVOO Technologies Ltd. All rights reserved.
          </p>
          <div className="flex gap-5">
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
              href="/home/support"
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cookie Policy
            </Link>
           </div>
        </div>
      </footer>
    </SidebarProvider>
  );
}
