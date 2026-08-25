"use client";

import Link from "next/link";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
} from "lucide-react";
import { XYVOO_AUTH_ROUTES } from "@/constants/auth-links";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar";

/** Match `WebsiteLayout` mobile sheet parent rows. */
const MOBILE_SHEET_ROW =
  "border-b border-border/70 px-5 py-4 transition-colors hover:bg-muted/40";

const MOBILE_SHEET_PARENT_TOGGLE =
  "flex w-full items-center justify-between gap-3 text-left text-base font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

const MENU_SURFACE =
  "min-w-[300px] max-w-[min(calc(100vw-1.5rem),24rem)] w-max rounded-xl border-0 bg-white p-2 text-foreground ring-0 data-[side=bottom]:slide-in-from-top-2";

const MENU_SHADOW = {
  border: "1px solid rgb(var(--xyvoo-blue-rgb) / 0.1)",
  boxShadow:
    "0 16px 48px -12px rgb(var(--xyvoo-navy-rgb) / 0.22), 0 4px 16px rgb(var(--xyvoo-navy-rgb) / 0.08)",
} as const;

const MOBILE_AUTH_SIGN_IN = "Sign in";
const MOBILE_AUTH_GET_STARTED = "Get started";

function AuthProductMenuRows({
  mode,
}: {
  mode: "signin" | "register";
}) {
  const entries = Object.entries(XYVOO_AUTH_ROUTES) as [
    keyof typeof XYVOO_AUTH_ROUTES,
    (typeof XYVOO_AUTH_ROUTES)["hms"],
  ][];

  return entries.map(([key, cfg]) => {
    const href = mode === "signin" ? cfg.login : cfg.register;
    const Icon = key === "hms" ? Building2 : ShoppingBag;
    const iconWellStyle =
      key === "hms"
        ? { background: "rgb(var(--xyvoo-blue-rgb) / 0.12)" }
        : { background: "rgb(var(--xyvoo-mint-rgb) / 0.22)" };
    const iconColor =
      key === "hms"
        ? "rgb(var(--xyvoo-blue-rgb) / 0.88)"
        : "var(--xyvoo-teal-product)";

    return (
      <DropdownMenuItem
        key={key}
        asChild
        className="cursor-pointer rounded-xl px-1 py-0.5 text-foreground focus:bg-muted/70 data-[highlighted]:bg-muted/70"
      >
        <Link
          href={href}
          className="flex items-start gap-4 px-2 py-2.5 outline-none [&:focus-visible]:ring-0"
        >
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-full"
            style={iconWellStyle}
          >
            <Icon
              className="size-[18px]"
              style={{ color: iconColor }}
              strokeWidth={2}
              aria-hidden
            />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
            <span className="text-sm font-semibold leading-snug text-foreground">
              {cfg.title}
            </span>
            <span
              className="text-[11px] font-normal leading-[1.45]"
              style={{ color: "var(--xyvoo-navy-muted-text)" }}
            >
              {cfg.subtitle}
            </span>
          </span>
        </Link>
      </DropdownMenuItem>
    );
  });
}

export function DesktopHeaderAuthMenus({ isHeroDark = false }: { isHeroDark?: boolean }) {
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="default"
            className={cn(
              "rounded-xl gap-1 px-5 font-semibold transition-all duration-200",
              isHeroDark
                ? "border-white/20 text-white hover:text-white hover:bg-white/10 bg-transparent"
                : "border-border text-foreground hover:bg-muted/80 hover:text-xyvoo-blue"
            )}
          >
            Sign in
            <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className={MENU_SURFACE}
          style={MENU_SHADOW}
        >
          <AuthProductMenuRows mode="signin" />
        </DropdownMenuContent>
      </DropdownMenu>
 
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="default"
            size="default"
            className={cn(
              "group rounded-xl px-5 font-semibold shadow-sm gap-1 data-[state=open]:shadow-md transition-all duration-200",
              isHeroDark
                ? "bg-white text-[#07162c] hover:bg-slate-50 hover:text-[#07162c] border border-transparent"
                : "bg-primary text-primary-foreground hover:bg-primary/92 border border-transparent"
            )}
          >
            Get started
            <ChevronDown
              className="size-3.5 shrink-0 opacity-90 transition-transform duration-200 group-data-[state=open]:rotate-180"
              aria-hidden
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className={MENU_SURFACE}
          style={MENU_SHADOW}
        >
          <AuthProductMenuRows mode="register" />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function MobileNavAuthCollapsible({
  sectionLabel,
  mode,
  pathname,
  onNavigate,
  expandedSection,
  onToggleSection,
}: {
  sectionLabel: string;
  mode: "signin" | "register";
  pathname: string;
  onNavigate: () => void;
  expandedSection: string | null;
  onToggleSection: (label: string) => void;
}) {
  const entries = Object.entries(XYVOO_AUTH_ROUTES) as [
    keyof typeof XYVOO_AUTH_ROUTES,
    (typeof XYVOO_AUTH_ROUTES)["hms"],
  ][];
  const expanded = expandedSection === sectionLabel;

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent className="px-0">
        <button
          type="button"
          className={cn(
            MOBILE_SHEET_ROW,
            MOBILE_SHEET_PARENT_TOGGLE,
            "hover:bg-muted/45",
          )}
          aria-expanded={expanded}
          onClick={() => onToggleSection(sectionLabel)}
        >
          <span>{sectionLabel}</span>
          {expanded ? (
            <ChevronUp className="size-4 shrink-0 opacity-60" aria-hidden />
          ) : (
            <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
          )}
        </button>
        {expanded ? (
          <ul
            role="list"
            className="divide-y divide-border/55 border-b border-border/70 bg-muted/15"
          >
            {entries.map(([key, cfg]) => {
              const href = mode === "signin" ? cfg.login : cfg.register;
              const active = pathname === href;
              const Icon = key === "hms" ? Building2 : ShoppingBag;
              const iconWellStyle =
                key === "hms"
                  ? { background: "rgb(var(--xyvoo-blue-rgb) / 0.12)" }
                  : { background: "rgb(var(--xyvoo-mint-rgb) / 0.22)" };
              const iconColor =
                key === "hms"
                  ? "rgb(var(--xyvoo-blue-rgb) / 0.88)"
                  : "var(--xyvoo-teal-product)";

              return (
                <li key={key}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      "flex w-full items-start gap-4 px-5 py-4 pl-9 text-left transition-colors hover:bg-muted/35 active:bg-muted/45",
                      active && "bg-blue-50/70",
                    )}
                  >
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-full"
                      style={iconWellStyle}
                    >
                      <Icon
                        className="size-[18px]"
                        style={{ color: iconColor }}
                        strokeWidth={2}
                        aria-hidden
                      />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span
                        className={cn(
                          "text-[15px] font-semibold leading-snug",
                          active ? "text-xyvoo-blue" : "text-foreground",
                        )}
                      >
                        {cfg.title}
                      </span>
                      <span className="text-[13px] font-normal leading-snug text-muted-foreground">
                        {cfg.subtitle}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function MobileNavAuthSection({
  onNavigate,
  pathname,
  expandedSection,
  onToggleSection,
}: {
  onNavigate: () => void;
  pathname: string;
  expandedSection: string | null;
  onToggleSection: (label: string) => void;
}) {
  return (
    <div className="shrink-0 border-t border-border/70">
      <MobileNavAuthCollapsible
        sectionLabel={MOBILE_AUTH_SIGN_IN}
        mode="signin"
        pathname={pathname}
        onNavigate={onNavigate}
        expandedSection={expandedSection}
        onToggleSection={onToggleSection}
      />
      <MobileNavAuthCollapsible
        sectionLabel={MOBILE_AUTH_GET_STARTED}
        mode="register"
        pathname={pathname}
        onNavigate={onNavigate}
        expandedSection={expandedSection}
        onToggleSection={onToggleSection}
      />
    </div>
  );
}
