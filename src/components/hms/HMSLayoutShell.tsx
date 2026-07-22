"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FrontDeskCheckoutDialog } from "@/components/hms/frontdesk/checkout/FrontDeskCheckoutDialog";
import {
  OPEN_CHECKOUT_EVENT,
  type OpenCheckoutDetail,
} from "@/lib/hms/open-checkout-bus";
import {
  ArrowLeft,
  ArrowLeftRight,
  BedDouble,
  Bell,
  CalendarDays,
  ChartNoAxesColumn,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Search,
  Settings,
  Soup,
  Sparkles,
  Trash2,
  Truck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { HmsNavIconKey, HmsNavItem } from "@/lib/hms/department-access";
import { getFrontDeskNavItems } from "@/lib/hms/department-access";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HmsNotificationsBell } from "@/components/hms/header/HmsNotificationsBell";
import { HmsQuickActionsMenu } from "@/components/hms/header/HmsQuickActionsMenu";

type HMSLayoutShellProps = {
  children: React.ReactNode;
  slug: string;
  currency: string;
  hotelDisplayName: string;
  logoUrl: string | null;
  currentUserName: string;
  roleLabel: string;
  homePath: string;
  settingsPath: string;
  canAccessAllDepartments: boolean;
  navItems: HmsNavItem[];
};

const ICON_MAP: Record<HmsNavIconKey, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  frontdesk: LayoutDashboard,
  reservations: CalendarDays,
  rooms: BedDouble,
  guests: Users,
  accounts: Wallet,
  "restaurant-bar": Soup,
  kitchen: Soup,
  inventory: ClipboardList,
  procurement: ClipboardList,
  housekeeping: Sparkles,
  maintenance: Settings,
  hr: Users,
  revenue: ChartNoAxesColumn,
  settings: Settings,
  bell: Bell,
  moon: Moon,
  doorOpen: DoorOpen,
  package: Package,
  truck: Truck,
  arrowLeftRight: ArrowLeftRight,
  clipboardCheck: ClipboardCheck,
  trash2: Trash2,
};

export default function HMSLayoutShell({
  children,
  slug,
  currency,
  hotelDisplayName,
  logoUrl,
  currentUserName,
  roleLabel,
  homePath,
  settingsPath,
  canAccessAllDepartments,
  navItems,
}: HMSLayoutShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const frontDeskBase = `/hms/${slug}/frontdesk`;
  const showFrontDeskCta =
    pathname === frontDeskBase || pathname.startsWith(`${frontDeskBase}/`);
  const checkInPath = `${frontDeskBase}/check-in`;
  const isOnHome = pathname === homePath;
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPrefill, setCheckoutPrefill] = useState<OpenCheckoutDetail>({});
  const activeNavKey =
    navItems
      .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
      .sort((left, right) => right.path.length - left.path.length)[0]?.key ?? null;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [frontDeskNavOpen, setFrontDeskNavOpen] = useState(false);
  const logoutFormId = `hms-account-logout-${slug}`;
  const mainRef = useRef<HTMLElement | null>(null);
  const showFrontDeskNavShortcut = canAccessAllDepartments && showFrontDeskCta;
  const frontDeskNavItems = showFrontDeskNavShortcut ? getFrontDeskNavItems(slug) : [];

  useEffect(() => {
    const onOpenCheckout = (e: Event) => {
      const detail = (e as CustomEvent<OpenCheckoutDetail>).detail ?? {};
      setCheckoutPrefill(detail);
      setCheckoutOpen(true);
    };
    window.addEventListener(OPEN_CHECKOUT_EVENT, onOpenCheckout);
    return () => window.removeEventListener(OPEN_CHECKOUT_EVENT, onOpenCheckout);
  }, []);

  useEffect(() => {
    if (!showFrontDeskCta) return;
    const room = searchParams.get("checkoutRoom");
    const reservationId = searchParams.get("checkoutReservation");
    if (searchParams.get("checkout") === "1" && (room || reservationId)) {
      setCheckoutPrefill({ roomCode: room ?? undefined, reservationId: reservationId ?? undefined });
      setCheckoutOpen(true);
    }
  }, [searchParams, showFrontDeskCta]);

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    // Reset scroll positions of document and window
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  /**
   * Robust hash-scroll handler:
   * 1. Decodes and normalizes hash (supports spaces, dashes, underscores).
   * 2. Resets document & window scroll to prevent the header from scrolling away.
   * 3. Walks up parent tree to reset any scroll position forced on overflow:hidden parents.
   * 4. Scrolls the <main> container to the target section.
   */
  useEffect(() => {
    const doScroll = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;

      const main = mainRef.current;
      if (!main) return;

      const decoded = decodeURIComponent(hash);
      const target =
        document.getElementById(decoded) ||
        document.getElementById(hash) ||
        document.getElementById(decoded.replace(/[\s_]+/g, "-")) ||
        document.getElementById(hash.replace(/[\s_]+/g, "-"));

      if (!target) return;

      // Reset document and window scroll
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo(0, 0);

      // Reset any scroll that the browser forced on overflow:hidden parents
      let parent = target.parentElement;
      while (parent && parent !== document.body) {
        if (parent !== main && parent.scrollTop > 0) {
          parent.scrollTop = 0;
        }
        parent = parent.parentElement;
      }

      const HEADER_HEIGHT = 72; // 4.5rem — matches h-[4.5rem] on the header
      const targetTop =
        target.getBoundingClientRect().top -
        main.getBoundingClientRect().top +
        main.scrollTop -
        HEADER_HEIGHT -
        16;
      main.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    };

    let rafId: number;
    let timerId: ReturnType<typeof setTimeout>;

    rafId = requestAnimationFrame(() => {
      timerId = setTimeout(doScroll, 100);
    });

    window.addEventListener("hashchange", doScroll);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      window.removeEventListener("hashchange", doScroll);
    };
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside
        data-tour="sidebar"
        className={`flex shrink-0 flex-col overflow-hidden bg-white transition-[width,border-color] duration-300 ${
          sidebarOpen ? "w-56 border-r border-slate-200" : "w-20 border-r border-slate-200"
        }`}
      >
        <div
          className={`flex h-18 shrink-0 items-center border-b border-slate-200 ${
            sidebarOpen ? "px-5" : "px-3"
          }`}
        >
          <div className={`flex w-full items-center ${sidebarOpen ? "gap-2" : "justify-center"}`}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Hotel logo"
                className="h-7 w-7 rounded-lg border border-slate-200 bg-slate-50 object-contain"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-white">
                {(hotelDisplayName || slug).charAt(0).toUpperCase() || "H"}
              </div>
            )}
            {sidebarOpen && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800">
                  {hotelDisplayName || "Hotel"}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">
                  {roleLabel}
                </p>
              </div>
            )}
          </div>
        </div>

        <nav className={`min-h-0 flex-1 space-y-0.5 overflow-y-auto py-3 ${sidebarOpen ? "px-3" : "px-2"}`}>
          {navItems.map(({ key, icon, label, path, tourTarget }) => {
            const Icon = ICON_MAP[icon];
            const active = activeNavKey === key;
            return (
              <Link
                key={key}
                href={path}
                title={label}
                aria-label={label}
                data-tour={tourTarget}
                className={`flex rounded-lg text-sm font-medium transition-all ${
                  sidebarOpen ? "items-center gap-3 px-3 py-2.5" : "justify-center px-0 py-3"
                } ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {sidebarOpen && <span>{label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className={`border-t border-slate-100 pb-4 pt-3 ${sidebarOpen ? "px-3" : "px-2"}`}>
          {!isOnHome && (
            <Link
              href={homePath}
              title="Back to Dashboard"
              aria-label="Back to Dashboard"
              className={`flex text-xs text-slate-400 transition-colors hover:text-slate-600 ${
                sidebarOpen ? "items-center gap-2 px-3 py-2" : "justify-center px-0 py-3"
              }`}
            >
              <ArrowLeft className="h-3 w-3" />
              {sidebarOpen && <span>Back to Dashboard</span>}
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-18 shrink-0 items-center border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex w-full items-center justify-between gap-6 px-6">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen((open) => !open)}
                className="size-10 shrink-0 rounded-xl text-slate-600"
                aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              >
                <Menu className="h-5 w-5" />
              </Button>

              <div className="relative w-full max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  placeholder="Search guests, reservations, rooms..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-800 outline-none transition-colors focus:border-blue-300 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              <form id={logoutFormId} action="/auth/logout" method="post" hidden />

              {showFrontDeskCta ? (
                <>
                  <HmsQuickActionsMenu slug={slug} />
                  {pathname !== checkInPath ? (
                    <Button
                      asChild
                      className="hidden h-10 rounded-xl px-4 font-semibold sm:inline-flex"
                    >
                      <Link href={checkInPath}>
                        <UserPlus className="h-4 w-4" aria-hidden />
                        Check In Guest
                      </Link>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="hidden h-10 rounded-xl border-orange-200 px-4 font-semibold text-orange-800 hover:bg-orange-50 sm:inline-flex"
                    onClick={() => {
                      setCheckoutPrefill({});
                      setCheckoutOpen(true);
                    }}
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Check Out Guest
                  </Button>
                </>
              ) : null}

              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="group h-auto gap-3 rounded-full px-2 py-1.5 text-left text-slate-700"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-slate-700">
                      {(currentUserName || hotelDisplayName || "H").charAt(0).toUpperCase()}
                    </div>
                    <div className="hidden min-w-0 sm:block">
                      <p className="max-w-45 truncate text-sm font-medium text-slate-800">
                        {currentUserName || hotelDisplayName || "Hotel"}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">
                        {roleLabel}
                      </p>
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-200/70"
                >
                  <DropdownMenuLabel className="border-b border-slate-100 px-3 py-2 font-normal">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {currentUserName || hotelDisplayName || "Hotel"}
                    </p>
                    <p className="text-xs font-normal text-slate-500">{roleLabel}</p>
                  </DropdownMenuLabel>
                  {canAccessAllDepartments ? (
                    <>
                      <DropdownMenuSeparator className="bg-slate-100" />
                      <DropdownMenuItem asChild className="cursor-pointer rounded-xl px-0 py-0 focus:bg-slate-50">
                        <Link
                          href={settingsPath}
                          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-700 outline-none hover:bg-slate-50 hover:text-slate-900"
                        >
                          <Settings className="h-4 w-4" />
                          Open settings
                        </Link>
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  <DropdownMenuSeparator className="bg-slate-100" />
                  <DropdownMenuItem variant="destructive" asChild className="cursor-pointer rounded-xl px-0 py-0">
                    <Button
                      type="submit"
                      variant="ghost"
                      form={logoutFormId}
                      className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </Button>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <HmsNotificationsBell slug={slug} />

              {showFrontDeskNavShortcut ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setFrontDeskNavOpen((open) => !open)}
                  className="size-10 shrink-0 rounded-xl text-slate-600"
                  aria-label={frontDeskNavOpen ? "Hide front desk links" : "Show front desk links"}
                  title="Front desk links"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              ) : null}
            </div>
          </div>
        </header>

        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      {showFrontDeskNavShortcut ? (
        <aside
          className={`flex shrink-0 flex-col overflow-hidden bg-white transition-[width,border-color] duration-300 ${
            frontDeskNavOpen ? "w-56 border-l border-slate-200" : "w-0 border-l-0"
          }`}
        >
          <div className="flex h-18 w-56 shrink-0 items-center border-b border-slate-200 px-5">
            <p className="truncate text-xs font-semibold uppercase tracking-wider text-slate-400">
              Front desk links
            </p>
          </div>
          <nav className="min-h-0 w-56 flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
            {frontDeskNavItems.map(({ key, icon, label, path }) => {
              const Icon = ICON_MAP[icon];
              const active = pathname === path || pathname.startsWith(`${path}/`);
              return (
                <Link
                  key={key}
                  href={path}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
      ) : null}

      {showFrontDeskCta ? (
        <FrontDeskCheckoutDialog
          slug={slug}
          currency={currency}
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          initialRoomCode={checkoutPrefill.roomCode}
          initialReservationId={checkoutPrefill.reservationId}
        />
      ) : null}
    </div>
  );
}
