"use client";

import { useState } from "react";
import {
  Receipt,
  CreditCard,
  Building2,
  CalendarDays,
  FileText,
  DollarSign,
  Pause,
  Play,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Split,
  Download,
  PlusCircle,
  Clock,
} from "lucide-react";
import styles from "./FolioFinanceInteractiveMockup.module.css";

type SplitLeg = "all" | "guest" | "company";

type FolioLine = {
  id: string;
  date: string;
  desc: string;
  dept: string;
  leg: "guest" | "company";
  amount: number;
  type: "debit" | "credit";
};

const INITIAL_LINES: FolioLine[] = [
  {
    id: "l-1",
    date: "Sep 04",
    desc: "Deluxe King Room — Night 1",
    dept: "Front Desk",
    leg: "company",
    amount: 240.0,
    type: "debit",
  },
  {
    id: "l-2",
    date: "Sep 04",
    desc: "Firefly Restaurant & Lounge (Order #FB-209)",
    dept: "F&B",
    leg: "guest",
    amount: 62.5,
    type: "debit",
  },
  {
    id: "l-3",
    date: "Sep 05",
    desc: "Minibar Refreshments & Water",
    dept: "Store / Room",
    leg: "guest",
    amount: 18.0,
    type: "debit",
  },
  {
    id: "l-4",
    date: "Sep 05",
    desc: "State Consumption Tax (5%) + VAT (7.5%)",
    dept: "Taxes",
    leg: "guest",
    amount: 10.06,
    type: "debit",
  },
  {
    id: "l-5",
    date: "Sep 04",
    desc: "Pre-Arrival Visa Card Authorization",
    dept: "Payment",
    leg: "company",
    amount: -100.0,
    type: "credit",
  },
];

export function FolioFinanceInteractiveMockup() {
  const [isPaused, setIsPaused] = useState(false);
  const [splitFilter, setSplitFilter] = useState<SplitLeg>("all");
  const [lines, setLines] = useState<FolioLine[]>(INITIAL_LINES);
  const [isSettled, setIsSettled] = useState(false);
  const [notification, setNotification] = useState<string | null>(
    "Folio #FOL-2026-8812 active · Interactive: tap Settle or Filter Legs below.",
  );

  const filteredLines = lines.filter((l) => {
    if (splitFilter === "all") return true;
    return l.leg === splitFilter;
  });

  const totalCharges = lines
    .filter((l) => l.amount > 0)
    .reduce((acc, l) => acc + l.amount, 0);

  const totalPayments = Math.abs(
    lines.filter((l) => l.amount < 0).reduce((acc, l) => acc + l.amount, 0),
  );

  const balance = isSettled ? 0 : totalCharges - totalPayments;

  const handleSettle = () => {
    setIsSettled(true);
    setNotification("Payment verified! Balance settled to $0.00 and VAT receipt issued.");
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
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
          </span>
          <span className="hidden sm:inline font-semibold text-slate-800">Financial Operations & Folio</span>
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
              Financial & accounting
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Folio, Billing & General Ledger
                </h1>
                <p className="mt-1 text-xs text-slate-500">
                  Branded tax invoicing, multi-leg corporate billing, automated charge posting, and audit-ready books.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span className="font-semibold">Audit Status: Balanced (0 variances)</span>
              </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 text-xs">
              <span className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white shadow-xs">
                Guest Folios
              </span>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100">
                Chart of Accounts (38)
              </span>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100">
                Journal Entries (142)
              </span>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100">
                Night Audit
              </span>
            </div>
          </section>

          {/* 2. FINANCIAL METRICS SNAPSHOT */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <DollarSign className="h-3.5 w-3.5 text-blue-600" />
                Gross Revenue (Mtd)
              </span>
              <p className="mt-2 text-lg sm:text-xl font-bold tabular-nums text-slate-900">$128,450.00</p>
              <p className="mt-0.5 text-[10px] text-emerald-600 font-medium">+14.2% vs last month</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <Receipt className="h-3.5 w-3.5 text-amber-500" />
                Open In-House Folios
              </span>
              <p className="mt-2 text-lg sm:text-xl font-bold tabular-nums text-slate-900">$4,820.00</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Across 25 in-house rooms</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
                Settled Today
              </span>
              <p className="mt-2 text-lg sm:text-xl font-bold tabular-nums text-slate-900">$18,240.00</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Cards, POS & Cash float</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <Clock className="h-3.5 w-3.5 text-purple-600" />
                Last Night Audit
              </span>
              <p className="mt-2 text-lg sm:text-xl font-bold text-slate-900">02:00 AM</p>
              <p className="mt-0.5 text-[10px] text-emerald-600 font-medium">Balanced · Day Closed</p>
            </div>
          </section>

          {/* 3. LIVE INTERACTIVE GUEST FOLIO (THE CORE FEATURE) */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                    Folio #FOL-2026-8812
                  </span>
                  <span className="text-xs font-semibold text-slate-700">
                    Room 102 · Deluxe King
                  </span>
                </div>
                <h2 className="mt-1.5 text-base sm:text-lg font-bold text-slate-900">
                  Guest: Dr. Sophia Loren
                </h2>
                <p className="text-[11px] text-slate-500">
                  Confirmation: <strong className="text-slate-700">XY-4892</strong> · Corporate Account:{" "}
                  <strong className="text-slate-700">Shell Petroleum Direct-Bill</strong>
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                  Current Balance Due
                </span>
                <span className="text-2xl sm:text-3xl font-black tabular-nums text-slate-900">
                  ${balance.toFixed(2)}
                </span>
                <div className="mt-1 flex items-center justify-end gap-1">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      isSettled
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isSettled ? "bg-emerald-600" : "bg-amber-500"
                      }`}
                    />
                    {isSettled ? "Folio Settled (Zero Balance)" : "Pending Departure Settlement"}
                  </span>
                </div>
              </div>
            </div>

            {/* Split-Billing Controls (Corporate vs Guest Leg) */}
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                  <Split className="h-3 w-3 text-slate-400" />
                  Split Leg View:
                </span>
                <button
                  type="button"
                  onClick={() => setSplitFilter("all")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                    splitFilter === "all"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  All Charges ({lines.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSplitFilter("guest")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                    splitFilter === "guest"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Guest Personal ($90.56)
                </button>
                <button
                  type="button"
                  onClick={() => setSplitFilter("company")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                    splitFilter === "company"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Corporate Billed ($140.00)
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5">
                {!isSettled ? (
                  <button
                    type="button"
                    onClick={handleSettle}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 cursor-pointer"
                  >
                    <CreditCard className="h-3 w-3" />
                    Settle Folio
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Receipt Issued
                  </span>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Download className="h-3 w-3 text-slate-500" />
                  Tax Invoice (PDF)
                </button>
              </div>
            </div>

            {/* Itemized Folio Table */}
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Department</th>
                    <th className="px-3 py-2">Split Leg</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLines.map((line) => (
                    <tr key={line.id} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2 font-medium text-slate-500 whitespace-nowrap">
                        {line.date}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {line.desc}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium">
                          {line.dept}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            line.leg === "company"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {line.leg === "company" ? "Corporate" : "Guest"}
                        </span>
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-bold tabular-nums ${
                          line.amount < 0 ? "text-emerald-600" : "text-slate-900"
                        }`}
                      >
                        {line.amount < 0
                          ? `-$${Math.abs(line.amount).toFixed(2)}`
                          : `$${line.amount.toFixed(2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Notification Bar */}
            <p className="mt-3 text-[11px] text-slate-500 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-blue-600" />
              <span>{notification}</span>
            </p>
          </section>

          {/* 4. GENERAL LEDGER & AUTOMATED POSTINGS */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              General ledger integration
            </p>
            <h2 className="mt-1 text-sm sm:text-base font-bold text-slate-900">
              Automated Journal Postings
            </h2>
            <p className="text-[11px] text-slate-500">
              Every room folio, F&B order, and payment automatically books double-entry journal entries.
            </p>

            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                      JRN-2026-094
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      Night Audit Room Revenue Posting
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Dr 1100 Guest Ledger · Cr 4010 Room Revenue · Cr 2150 Consumption Tax
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900 tabular-nums">$6,840.00</span>
                  <span className="block text-[10px] font-semibold text-emerald-700">Posted</span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                      JRN-2026-095
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      F&B Restaurant Settlement Batch
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Dr 1020 Bank POS Settlement · Cr 4020 Restaurant Sales
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900 tabular-nums">$3,420.00</span>
                  <span className="block text-[10px] font-semibold text-emerald-700">Posted</span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
                      INV-2026-102
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      Corporate Direct-Bill Invoice (Shell Petroleum)
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Dr 1200 Accounts Receivable · Cr 1100 Guest Ledger Transfer
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900 tabular-nums">$1,240.00</span>
                  <span className="block text-[10px] font-semibold text-blue-700">Dispatched</span>
                </div>
              </div>
            </div>
          </section>

          {/* 5. FINANCE CAPABILITY CARDS */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pb-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <span className="h-1.5 w-6 rounded-full bg-blue-600 block mb-2" />
              <p className="font-bold text-slate-900 text-xs">Split Folios</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Separate corporate room & personal extras</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <span className="h-1.5 w-6 rounded-full bg-emerald-500 block mb-2" />
              <p className="font-bold text-slate-900 text-xs">Automated Night Audit</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Roll the date and lock daily revenue</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <span className="h-1.5 w-6 rounded-full bg-amber-400 block mb-2" />
              <p className="font-bold text-slate-900 text-xs">Local & State Taxes</p>
              <p className="text-[10px] text-slate-500 mt-0.5">VAT and consumption rules auto-calculated</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <span className="h-1.5 w-6 rounded-full bg-purple-500 block mb-2" />
              <p className="font-bold text-slate-900 text-xs">Branded Tax Invoices</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Compliant PDFs sent with your logo</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
