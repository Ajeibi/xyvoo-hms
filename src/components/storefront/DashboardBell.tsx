"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, PackageOpen, ShoppingCart, Star } from "lucide-react";
import type { InboxItem } from "@/lib/store/inbox";
import { MEANING } from "./meaning";

const SEEN_KEY = "xyvoo_inbox_seen_";

const KIND = {
  order: { icon: ShoppingCart, tone: MEANING.orders },
  review: { icon: Star, tone: MEANING.customers },
  stock: { icon: PackageOpen, tone: MEANING.stock },
} as const;

function readSeen(slug: string) {
  try {
    return localStorage.getItem(SEEN_KEY + slug) || "";
  } catch {
    return "";
  }
}

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** The bell in the dashboard header: what's happened lately, with a dot for anything new since you last looked. */
export default function DashboardBell({ slug, refreshKey }: { slug: string; refreshKey: string }) {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store/inbox?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setItems(data.items || []);
          setSeen(readSeen(slug));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug, refreshKey]);

  // Close on Escape or a click outside, handing focus back to the bell.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Stock news is about now, so only orders and reviews count as "new since you looked".
  const newest = (items || []).filter((i) => i.kind !== "stock").reduce((max, i) => (i.at > max ? i.at : max), "");
  const unread = (items || []).filter((i) => i.kind !== "stock" && i.at > seen).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && newest) {
      try {
        localStorage.setItem(SEEN_KEY + slug, newest);
      } catch {
        // Storage blocked: the dot comes back next visit.
      }
      // The dot clears once the list has been opened.
      setTimeout(() => setSeen(newest), 1500);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="dashboard-inbox"
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        <span className="sr-only">{unread ? `What's new: ${unread} new` : "What's new"}</span>
        {unread ? <span aria-hidden className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" /> : null}
      </button>
      {open ? (
        <div
          id="dashboard-inbox"
          className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          <p className="border-b border-slate-100 px-4 py-3 font-heading text-sm font-semibold text-slate-900">What&rsquo;s new</p>
          {items === null ? (
            <p className="px-4 py-6 text-sm text-slate-600">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-600">Nothing new in the last two weeks. New orders, reviews and low stock will show up here.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
              {items.map((item) => {
                const { icon: Icon, tone } = KIND[item.kind];
                const isNew = item.kind !== "stock" && item.at > seen;
                return (
                  <li key={item.id}>
                    <Link href={item.href} onClick={() => setOpen(false)} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                      <span aria-hidden className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.tint} ${tone.icon}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block font-medium text-slate-900">
                          {item.title}
                          {isNew ? <span className="ml-2 rounded-full bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">New</span> : null}
                        </span>
                        <span className="block truncate text-slate-600">{item.detail}</span>
                        {item.kind !== "stock" ? <span className="block text-xs text-slate-500">{timeAgo(item.at)}</span> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
