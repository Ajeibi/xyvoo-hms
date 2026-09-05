"use client";

import { useState } from "react";
import {
  UtensilsCrossed,
  ChefHat,
  Clock,
  CheckCircle2,
  Sparkles,
  Flame,
  Pause,
  Play,
  Send,
  Plus,
  Wine,
  CreditCard,
  Layers,
  ArrowRight,
  ShieldCheck,
  BellRing,
} from "lucide-react";
import styles from "./FbPosInteractiveMockup.module.css";

type OrderItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  status: "pending" | "preparing" | "ready";
};

export function FbPosInteractiveMockup() {
  const [isPaused, setIsPaused] = useState(false);
  const [activeOutlet, setActiveOutlet] = useState<"restaurant" | "bar">("restaurant");
  const [activeStation, setActiveStation] = useState<string>("all");
  const [ticket104Sent, setTicket104Sent] = useState(false);
  const [items, setItems] = useState<OrderItem[]>([
    { id: "i-1", name: "Wood-Fired Ribeye (350g)", price: 48.0, qty: 1, status: "pending" },
    { id: "i-2", name: "Grilled Jumbo Prawns", price: 34.0, qty: 1, status: "pending" },
    { id: "i-3", name: "Signature Chapman Cocktail", price: 12.0, qty: 2, status: "pending" },
  ]);
  const [ticket104Status, setTicket104Status] = useState<"queued" | "preparing" | "ready">("queued");

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  const handleSendToKitchen = () => {
    setTicket104Sent(true);
    setTicket104Status("preparing");
  };

  const handleMarkTicketReady = () => {
    setTicket104Status("ready");
    setItems((prev) => prev.map((item) => ({ ...item, status: "ready" })));
  };

  return (
    <div
      className={styles.scrollContainer}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Floating Top Control Overlay */}
      <div className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-[11px] font-medium text-slate-700 shadow-md backdrop-blur-md">
        <span className="flex items-center gap-1.5 text-slate-500">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
          </span>
          <span className="hidden sm:inline font-semibold text-slate-800">
            F&B Engine: POS + Kitchen KDS
          </span>
        </span>
        <span className="text-slate-300">|</span>
        <button
          type="button"
          onClick={() => setIsPaused((prev) => !prev)}
          className="flex items-center gap-1 text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          {isPaused ? (
            <>
              <Play className="h-3 w-3 fill-slate-600 text-slate-600" />
              <span>Resume</span>
            </>
          ) : (
            <>
              <Pause className="h-3 w-3 fill-slate-600 text-slate-600" />
              <span>Pause</span>
            </>
          )}
        </button>
      </div>

      {/* Auto-scrolling Track */}
      <div className={`${styles.scrollTrack} ${isPaused ? styles.paused : ""}`}>
        <div className="mx-auto w-full max-w-[960px] p-3 sm:p-5 space-y-4 sm:space-y-5 text-slate-800 font-sans text-xs">
          {/* 1. HERO SECTION */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm shadow-slate-200/40">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Food & beverage management
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Restaurant POS & Kitchen KDS
                </h1>
                <p className="mt-1 text-xs text-slate-500">
                  Tableside and bar ordering seamlessly synchronized with live kitchen display screens and guest room folios.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs text-orange-800">
                <ChefHat className="h-3.5 w-3.5 text-orange-600" />
                <span className="font-semibold">2 Connected Operations</span>
              </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 text-xs">
              <span className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white shadow-xs">
                🍽️ Restaurant POS & Tables
              </span>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100">
                🍳 Kitchen Display (KDS)
              </span>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100">
                Menu & Recipe Inventory
              </span>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100">
                Room Folio Settlement
              </span>
            </div>
          </section>

          {/* 2. LIVE F&B METRICS */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <UtensilsCrossed className="h-3.5 w-3.5 text-blue-600" />
                Active Tables
              </span>
              <p className="mt-2 text-lg sm:text-xl font-bold tabular-nums text-slate-900">12 / 16</p>
              <p className="mt-0.5 text-[10px] text-slate-500">75% dining floor occupancy</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <ChefHat className="h-3.5 w-3.5 text-orange-500" />
                Kitchen Tickets
              </span>
              <p className="mt-2 text-lg sm:text-xl font-bold tabular-nums text-slate-900">4 Open</p>
              <p className="mt-0.5 text-[10px] text-emerald-600 font-medium">Avg ticket time: 11m</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
                F&B Sales Today
              </span>
              <p className="mt-2 text-lg sm:text-xl font-bold tabular-nums text-slate-900">$4,850.00</p>
              <p className="mt-0.5 text-[10px] text-slate-500">62 orders fulfilled</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
                Folio Room Billing
              </span>
              <p className="mt-2 text-lg sm:text-xl font-bold text-slate-900">74%</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Charged directly to stay</p>
            </div>
          </section>

          {/* 3. DASHBOARD 1: RESTAURANT & BAR POINT OF SALE (POS) */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 uppercase tracking-wider">
                  Dashboard 1: Restaurant POS
                </span>
                <h2 className="mt-1 text-sm sm:text-base font-bold text-slate-900">
                  Tableside Order Terminal · Table 04
                </h2>
                <p className="text-[11px] text-slate-500">
                  Server: <strong className="text-slate-700">Tunde Adeyemi</strong> · Dining Area:{" "}
                  <strong className="text-slate-700">Main Restaurant & Grill</strong>
                </p>
              </div>

              {/* Outlet Tabs */}
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveOutlet("restaurant")}
                  className={`rounded-md px-2.5 py-1 transition-all cursor-pointer ${
                    activeOutlet === "restaurant"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Dining Room
                </button>
                <button
                  type="button"
                  onClick={() => setActiveOutlet("bar")}
                  className={`rounded-md px-2.5 py-1 transition-all cursor-pointer ${
                    activeOutlet === "bar"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Poolside Bar
                </button>
              </div>
            </div>

            {/* Table Floor Status Grid */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-2 text-center shadow-xs">
                <span className="text-xs font-bold text-blue-900">Table 01</span>
                <span className="block text-[10px] text-blue-700">Occupied · $84</span>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-2 text-center shadow-xs">
                <span className="text-xs font-bold text-blue-900">Table 02</span>
                <span className="block text-[10px] text-blue-700">Mains Served</span>
              </div>
              <div className="rounded-xl border-2 border-blue-600 bg-white p-2 text-center shadow-sm ring-2 ring-blue-500/20">
                <span className="text-xs font-extrabold text-blue-600">Table 04</span>
                <span className="block text-[10px] font-bold text-slate-900">Active Order</span>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-2 text-center shadow-xs">
                <span className="text-xs font-bold text-emerald-900">Table 05</span>
                <span className="block text-[10px] text-emerald-700">Available</span>
              </div>
              <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-2 text-center shadow-xs">
                <span className="text-xs font-bold text-purple-900">VIP Booth 1</span>
                <span className="block text-[10px] text-purple-700">Room 102 Folio</span>
              </div>
            </div>

            {/* Active POS Ticket Preview */}
            <div className="mt-3.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <UtensilsCrossed className="h-3.5 w-3.5 text-blue-600" />
                  Order Ticket #FB-104 (Table 04)
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                  <Flame className="h-3 w-3 text-orange-600" /> Rush Order
                </span>
              </div>

              {/* Line Items */}
              <div className="mt-2 space-y-1.5 divide-y divide-slate-100">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between items-center pt-1.5 text-xs">
                    <span className="font-medium text-slate-800">
                      {item.qty}× {item.name}
                    </span>
                    <span className="font-bold tabular-nums text-slate-900">
                      ${(item.price * item.qty).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Subtotal & Action */}
              <div className="mt-3 pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Order Total
                  </span>
                  <span className="text-lg font-black text-slate-900 tabular-nums">
                    ${subtotal.toFixed(2)}
                  </span>
                </div>

                {!ticket104Sent ? (
                  <button
                    type="button"
                    onClick={handleSendToKitchen}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition-all cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send to Kitchen KDS →
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Dispatched to Kitchen Display
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* 4. DASHBOARD 2: KITCHEN DISPLAY SYSTEM (KDS) */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <span className="inline-flex items-center gap-1 rounded bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800 uppercase tracking-wider">
                  Dashboard 2: Kitchen Display System (KDS)
                </span>
                <h2 className="mt-1 text-sm sm:text-base font-bold text-slate-900">
                  Live Chef & Preparation Station Display
                </h2>
                <p className="text-[11px] text-slate-500">
                  Tickets appear in real-time as servers take orders on POS or room service.
                </p>
              </div>

              {/* Station Filter Tabs */}
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveStation("all")}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition-all cursor-pointer ${
                    activeStation === "all" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  All Stations
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStation("grill")}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition-all cursor-pointer ${
                    activeStation === "grill" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  Hot Grill
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStation("bar")}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition-all cursor-pointer ${
                    activeStation === "bar" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  Bar
                </button>
              </div>
            </div>

            {/* Kitchen Display Tickets Grid */}
            <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Ticket #104 (Dispatched from POS above!) */}
              <div
                className={`rounded-2xl border-2 p-3.5 shadow-sm transition-all ${
                  ticket104Status === "ready"
                    ? "border-emerald-500 bg-emerald-50/40"
                    : "border-orange-300 bg-orange-50/30 ring-2 ring-orange-400/30"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-base font-extrabold text-slate-900">#FB-104</span>
                    <span className="block text-xs font-semibold text-slate-600">Table 04 · Server: Tunde</span>
                  </div>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                      ticket104Status === "ready"
                        ? "bg-emerald-600 text-white"
                        : "bg-orange-600 text-white animate-pulse"
                    }`}
                  >
                    {ticket104Status === "ready" ? "Ready · 8m" : "Prep · 4m"}
                  </span>
                </div>

                {/* Items in ticket */}
                <div className="mt-2.5 space-y-1.5">
                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <p className="font-bold text-slate-900 text-xs">1× Wood-Fired Ribeye (Medium-Rare)</p>
                    <p className="text-[10px] text-slate-500">Station: Hot Grill</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <p className="font-bold text-slate-900 text-xs">1× Grilled Jumbo Prawns</p>
                    <p className="text-[10px] text-slate-500">Station: Seafood Station</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <p className="font-bold text-slate-900 text-xs">2× Signature Chapman Cocktail</p>
                    <p className="text-[10px] text-slate-500">Station: Service Bar</p>
                  </div>
                </div>

                {/* Kitchen Action Buttons */}
                <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500">
                    Billed to: <strong className="text-slate-800">Table Guest</strong>
                  </span>
                  {ticket104Status !== "ready" ? (
                    <button
                      type="button"
                      onClick={handleMarkTicketReady}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 cursor-pointer"
                    >
                      <BellRing className="h-3 w-3" />
                      Mark Ready for Server
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                      Server Paged for Pickup
                    </span>
                  )}
                </div>
              </div>

              {/* Ticket #102 (Room Service Order) */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 shadow-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-base font-extrabold text-slate-900">#FB-102</span>
                    <span className="block text-xs font-semibold text-purple-700">
                      Room 102 · Dr. Sophia Loren
                    </span>
                  </div>
                  <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
                    Ready · 12m
                  </span>
                </div>

                <div className="mt-2.5 space-y-1.5">
                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <p className="font-bold text-slate-900 text-xs">2× Pan-Seared Atlantic Salmon</p>
                    <p className="text-[10px] text-slate-500">Station: Hot Grill · Ready</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <p className="font-bold text-slate-900 text-xs">1× Caesar Salad (Extra Parmesan)</p>
                    <p className="text-[10px] text-slate-500">Station: Pantry · Ready</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-200">
                  <span className="text-[10px] font-semibold text-purple-700">
                    Charged to: <strong>Room 102 Folio</strong>
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Delivered to Room
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* 5. F&B CAPABILITY CARDS */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pb-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <span className="h-1.5 w-6 rounded-full bg-blue-600 block mb-2" />
              <p className="font-bold text-slate-900 text-xs">Direct Folio Posting</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Post dining checks directly to room stay</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <span className="h-1.5 w-6 rounded-full bg-orange-500 block mb-2" />
              <p className="font-bold text-slate-900 text-xs">Kitchen KDS Routing</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Items split by kitchen prep stations</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <span className="h-1.5 w-6 rounded-full bg-emerald-500 block mb-2" />
              <p className="font-bold text-slate-900 text-xs">Table Management</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Real-time table turnover & status</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <span className="h-1.5 w-6 rounded-full bg-purple-500 block mb-2" />
              <p className="font-bold text-slate-900 text-xs">Menu Recipe Depletion</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Auto-deduct ingredients from store</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
