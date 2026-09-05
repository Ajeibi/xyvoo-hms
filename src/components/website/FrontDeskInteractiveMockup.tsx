"use client";

import { useState } from "react";
import {
  CalendarDays,
  Users,
  UserPlus,
  LogOut,
  Star,
  Moon,
  Pause,
  Play,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  CreditCard,
} from "lucide-react";
import styles from "./FrontDeskInteractiveMockup.module.css";

export function FrontDeskInteractiveMockup() {
  const [isPaused, setIsPaused] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>("103");
  const [activeFloor, setActiveFloor] = useState<number>(1);
  const [room103CheckedIn, setRoom103CheckedIn] = useState(false);

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
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="hidden sm:inline font-semibold text-slate-800">Front Desk Live Dashboard</span>
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
              Front desk
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Front Desk Operations
                </h1>
                <p className="mt-1 text-xs text-slate-500">
                  Live room status, rapid check-in and check-out, and on-property room controls.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                <span className="text-slate-500">Registered inventory:</span>
                <span className="font-bold tabular-nums text-slate-900">32</span>
                <span className="text-slate-500">rooms</span>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors cursor-pointer"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Check in guest
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50/50 px-3.5 py-2 text-xs font-semibold text-orange-800 hover:bg-orange-100 transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                Check out guest
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Arrivals
              </button>
            </div>
          </section>

          {/* 2. PROPERTY SNAPSHOT METRICS */}
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500">
                <CalendarDays className="h-4 w-4 text-blue-600" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Reservations
                </p>
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-bold tabular-nums text-slate-900">142</p>
              <p className="mt-1 text-[11px] text-slate-500">Total active reservations on file</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500">
                <Users className="h-4 w-4 text-emerald-600" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Guests
                </p>
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-bold tabular-nums text-slate-900">48</p>
              <p className="mt-1 text-[11px] text-slate-500">Headcount on in-house guest stays</p>
            </div>
          </section>

          {/* 3. OCCUPANCY WIDGET */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Occupancy
            </p>
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-4">
              {/* Doughnut SVG Mockup */}
              <div className="relative mx-auto sm:mx-0 h-24 w-24 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9155"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="3.5"
                  />
                  {/* Occupied arc (78%) */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9155"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="3.8"
                    strokeDasharray="78, 100"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-base font-bold text-slate-900">78%</span>
                  <span className="text-[8px] uppercase tracking-wider text-slate-400">Occupied</span>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Property snapshot
                </h2>
                <p className="text-[11px] text-slate-500">
                  32 rooms · 48 guests on property · 25 rooms occupied (78%)
                </p>

                {/* Progress bar */}
                <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-slate-100">
                  <div style={{ width: "78%" }} className="bg-blue-600" title="Occupied: 25" />
                  <div style={{ width: "12%" }} className="bg-emerald-500" title="Available: 4" />
                  <div style={{ width: "7%" }} className="bg-amber-400" title="Reserved: 2" />
                  <div style={{ width: "3%" }} className="bg-orange-500" title="Maintenance: 1" />
                </div>

                {/* 4 Stat breakdown chips */}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                      Occupied
                    </span>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">25</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Available
                    </span>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">4</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      Reserved
                    </span>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">2</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                      Turnover
                    </span>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">1</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 4. ROOM STATUS SUMMARY CARDS */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Room status
            </p>
            <h2 className="mt-1 text-sm sm:text-base font-bold text-slate-900">Status summary</h2>
            <p className="text-[11px] text-slate-500">Real-time room count breakdown across all floors.</p>

            <div className="mt-3.5 grid grid-cols-3 sm:grid-cols-6 gap-2">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                <div className="h-1 bg-red-500" />
                <div className="p-2 sm:p-2.5">
                  <p className="text-lg sm:text-xl font-bold text-slate-900">0</p>
                  <p className="text-[10px] text-slate-500 truncate">Overdue</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                <div className="h-1 bg-emerald-500" />
                <div className="p-2 sm:p-2.5">
                  <p className="text-lg sm:text-xl font-bold text-slate-900">4</p>
                  <p className="text-[10px] text-slate-500 truncate">Available</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                <div className="h-1 bg-amber-400" />
                <div className="p-2 sm:p-2.5">
                  <p className="text-lg sm:text-xl font-bold text-slate-900">2</p>
                  <p className="text-[10px] text-slate-500 truncate">Reserved</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                <div className="h-1 bg-orange-500" />
                <div className="p-2 sm:p-2.5">
                  <p className="text-lg sm:text-xl font-bold text-slate-900">1</p>
                  <p className="text-[10px] text-slate-500 truncate">Dirty / HK</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                <div className="h-1 bg-violet-600" />
                <div className="p-2 sm:p-2.5">
                  <p className="text-lg sm:text-xl font-bold text-slate-900">1</p>
                  <p className="text-[10px] text-slate-500 truncate">Maintenance</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                <div className="h-1 bg-blue-600" />
                <div className="p-2 sm:p-2.5">
                  <p className="text-lg sm:text-xl font-bold text-slate-900">24</p>
                  <p className="text-[10px] text-slate-500 truncate">Occupied</p>
                </div>
              </div>
            </div>
          </section>

          {/* 5. FLOOR PLAN & ROOM GRID (THE SIGNATURE FEATURE) */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Floor plan
                </p>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">Room grid</h2>
                <p className="text-[11px] text-slate-500">
                  Click a room to inspect live stay details or test check-in.
                </p>
              </div>

              {/* Floor switcher */}
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveFloor(1)}
                  className={`rounded-md px-2.5 py-1 transition-all cursor-pointer ${
                    activeFloor === 1 ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Floor 1
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFloor(2)}
                  className={`rounded-md px-2.5 py-1 transition-all cursor-pointer ${
                    activeFloor === 2 ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Floor 2
                </button>
              </div>
            </div>

            {/* Room Cells Grid - Authentic FrontDeskRoomCell appearance */}
            <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {/* Room 101 */}
              <button
                type="button"
                onClick={() => setSelectedRoom("101")}
                className={`relative min-h-[72px] w-full flex-col justify-center rounded-xl p-2 text-center text-xs font-semibold shadow-xs transition-all cursor-pointer bg-emerald-500 text-white hover:bg-emerald-600 ${
                  selectedRoom === "101" ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-white scale-105 z-10" : ""
                }`}
              >
                <span className="text-sm font-bold tabular-nums">101</span>
                <span className="block text-[9px] font-bold uppercase tracking-wide opacity-90">STND</span>
                <span className="block text-[10px] font-medium opacity-95">Clean</span>
              </button>

              {/* Room 102 */}
              <button
                type="button"
                onClick={() => setSelectedRoom("102")}
                className={`relative min-h-[72px] w-full flex-col justify-center rounded-xl p-2 text-center text-xs font-semibold shadow-xs transition-all cursor-pointer bg-blue-600 text-white hover:bg-blue-700 ${
                  selectedRoom === "102" ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-white scale-105 z-10" : ""
                }`}
              >
                <Star className="absolute left-1.5 top-1.5 h-3 w-3 fill-amber-300 text-amber-300" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-white" />
                <Moon className="absolute bottom-1 left-1.5 h-3 w-3 text-white/90" />
                <span className="text-sm font-bold tabular-nums">102</span>
                <span className="block text-[9px] font-bold uppercase tracking-wide opacity-90">DLX</span>
                <span className="block truncate text-[10px] font-medium opacity-95">Dr. Sophia</span>
              </button>

              {/* Room 103 */}
              <button
                type="button"
                onClick={() => setSelectedRoom("103")}
                className={`relative min-h-[72px] w-full flex-col justify-center rounded-xl p-2 text-center text-xs font-semibold shadow-xs transition-all cursor-pointer ${
                  room103CheckedIn
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-amber-400 text-slate-900 hover:bg-amber-500"
                } ${
                  selectedRoom === "103" ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-white scale-105 z-10" : ""
                }`}
              >
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-600 ring-1 ring-white" />
                <span className="text-sm font-bold tabular-nums">103</span>
                <span className="block text-[9px] font-bold uppercase tracking-wide opacity-90">DLX</span>
                <span className="block truncate text-[10px] font-medium opacity-95">
                  {room103CheckedIn ? "Marcus V." : "Arriving 14h"}
                </span>
              </button>

              {/* Room 104 */}
              <button
                type="button"
                onClick={() => setSelectedRoom("104")}
                className={`relative min-h-[72px] w-full flex-col justify-center rounded-xl p-2 text-center text-xs font-semibold shadow-xs transition-all cursor-pointer bg-blue-600 text-white hover:bg-blue-700 ${
                  selectedRoom === "104" ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-white scale-105 z-10" : ""
                }`}
              >
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-white" />
                <span className="text-sm font-bold tabular-nums">104</span>
                <span className="block text-[9px] font-bold uppercase tracking-wide opacity-90">SUITE</span>
                <span className="block truncate text-[10px] font-medium opacity-95">Alexander</span>
              </button>

              {/* Room 105 */}
              <button
                type="button"
                onClick={() => setSelectedRoom("105")}
                className={`relative min-h-[72px] w-full flex-col justify-center rounded-xl p-2 text-center text-xs font-semibold shadow-xs transition-all cursor-pointer bg-orange-500 text-white hover:bg-orange-600 ${
                  selectedRoom === "105" ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-white scale-105 z-10" : ""
                }`}
              >
                <span className="text-sm font-bold tabular-nums">105</span>
                <span className="block text-[9px] font-bold uppercase tracking-wide opacity-90">STND</span>
                <span className="block text-[10px] font-medium opacity-95">Turnover</span>
              </button>

              {/* Room 106 */}
              <button
                type="button"
                onClick={() => setSelectedRoom("106")}
                className={`relative min-h-[72px] w-full flex-col justify-center rounded-xl p-2 text-center text-xs font-semibold shadow-xs transition-all cursor-pointer bg-blue-600 text-white hover:bg-blue-700 ${
                  selectedRoom === "106" ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-white scale-105 z-10" : ""
                }`}
              >
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-white" />
                <span className="text-sm font-bold tabular-nums">106</span>
                <span className="block text-[9px] font-bold uppercase tracking-wide opacity-90">PREM</span>
                <span className="block truncate text-[10px] font-medium opacity-95">Amara O.</span>
              </button>

              {/* Room 107 */}
              <button
                type="button"
                onClick={() => setSelectedRoom("107")}
                className={`relative min-h-[72px] w-full flex-col justify-center rounded-xl p-2 text-center text-xs font-semibold shadow-xs transition-all cursor-pointer bg-emerald-500 text-white hover:bg-emerald-600 ${
                  selectedRoom === "107" ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-white scale-105 z-10" : ""
                }`}
              >
                <span className="text-sm font-bold tabular-nums">107</span>
                <span className="block text-[9px] font-bold uppercase tracking-wide opacity-90">DLX</span>
                <span className="block text-[10px] font-medium opacity-95">Clean</span>
              </button>

              {/* Room 108 */}
              <button
                type="button"
                onClick={() => setSelectedRoom("108")}
                className={`relative min-h-[72px] w-full flex-col justify-center rounded-xl p-2 text-center text-xs font-semibold shadow-xs transition-all cursor-pointer bg-violet-600 text-white hover:bg-violet-700 ${
                  selectedRoom === "108" ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-white scale-105 z-10" : ""
                }`}
              >
                <span className="text-sm font-bold tabular-nums">108</span>
                <span className="block text-[9px] font-bold uppercase tracking-wide opacity-90">SUITE</span>
                <span className="block text-[10px] font-medium opacity-95">Maint.</span>
              </button>

              {/* Room 109 */}
              <button
                type="button"
                onClick={() => setSelectedRoom("109")}
                className={`relative min-h-[72px] w-full flex-col justify-center rounded-xl p-2 text-center text-xs font-semibold shadow-xs transition-all cursor-pointer bg-blue-600 text-white hover:bg-blue-700 ${
                  selectedRoom === "109" ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-white scale-105 z-10" : ""
                }`}
              >
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-white" />
                <span className="text-sm font-bold tabular-nums">109</span>
                <span className="block text-[9px] font-bold uppercase tracking-wide opacity-90">PREM</span>
                <span className="block truncate text-[10px] font-medium opacity-95">Elena R.</span>
              </button>

              {/* Room 110 */}
              <button
                type="button"
                onClick={() => setSelectedRoom("110")}
                className={`relative min-h-[72px] w-full flex-col justify-center rounded-xl p-2 text-center text-xs font-semibold shadow-xs transition-all cursor-pointer bg-amber-400 text-slate-900 hover:bg-amber-500 ${
                  selectedRoom === "110" ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-white scale-105 z-10" : ""
                }`}
              >
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-600 ring-1 ring-white" />
                <span className="text-sm font-bold tabular-nums">110</span>
                <span className="block text-[9px] font-bold uppercase tracking-wide opacity-90">STND</span>
                <span className="block truncate text-[10px] font-medium opacity-95">David C.</span>
              </button>

              {/* Room 111 */}
              <button
                type="button"
                onClick={() => setSelectedRoom("111")}
                className={`relative min-h-[72px] w-full flex-col justify-center rounded-xl p-2 text-center text-xs font-semibold shadow-xs transition-all cursor-pointer bg-blue-600 text-white hover:bg-blue-700 ${
                  selectedRoom === "111" ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-white scale-105 z-10" : ""
                }`}
              >
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-white" />
                <span className="text-sm font-bold tabular-nums">111</span>
                <span className="block text-[9px] font-bold uppercase tracking-wide opacity-90">DLX</span>
                <span className="block truncate text-[10px] font-medium opacity-95">Sarah J.</span>
              </button>

              {/* Room 112 */}
              <button
                type="button"
                onClick={() => setSelectedRoom("112")}
                className={`relative min-h-[72px] w-full flex-col justify-center rounded-xl p-2 text-center text-xs font-semibold shadow-xs transition-all cursor-pointer bg-emerald-500 text-white hover:bg-emerald-600 ${
                  selectedRoom === "112" ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-white scale-105 z-10" : ""
                }`}
              >
                <span className="text-sm font-bold tabular-nums">112</span>
                <span className="block text-[9px] font-bold uppercase tracking-wide opacity-90">SUITE</span>
                <span className="block text-[10px] font-medium opacity-95">Clean</span>
              </button>
            </div>

            {/* Selected Room Interactive Action Callout */}
            {selectedRoom === "103" && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/70 p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    Room 103 · Deluxe King · {room103CheckedIn ? "In-House" : "Reserved"}
                  </p>
                  <p className="text-[11px] text-slate-600">
                    Guest: <strong>Marcus Vance</strong> (Ref #XY-9104) · Nightly Rate: $240
                  </p>
                </div>
                <div>
                  {!room103CheckedIn ? (
                    <button
                      type="button"
                      onClick={() => setRoom103CheckedIn(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 cursor-pointer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Complete Check-in
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                      Checked in & Key issued
                    </span>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* 6. MOVEMENT TIMELINE (ARRIVALS & DEPARTURES) */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Movement timeline
            </p>
            <h2 className="mt-1 text-sm sm:text-base font-bold text-slate-900">
              Today&apos;s arrivals and departures
            </h2>

            <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Arrivals */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Arrivals today (3)
                </p>
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900">Marcus Vance</span>
                    <span className="text-[10px] font-semibold text-amber-800">14:00 PM</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">Room 103 · Deluxe King · Direct booking</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900">David Chen</span>
                    <span className="text-[10px] font-semibold text-slate-600">15:30 PM</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">Room 110 · Standard Queen · OTA booking</p>
                </div>
              </div>

              {/* Departures */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  Departures today (2)
                </p>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900">
                      <Star className="inline h-3 w-3 fill-amber-400 text-amber-500 mr-1" />
                      Dr. Sophia Loren
                    </span>
                    <span className="text-[10px] font-semibold text-purple-700">12:00 PM (Late)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">Room 102 · Folio settled · Express out</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900">Elena Rostova</span>
                    <span className="text-[10px] font-semibold text-slate-600">11:00 AM</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">Room 109 · Premier Ocean · Folio settled</p>
                </div>
              </div>
            </div>
          </section>

          {/* 7. FRONT DESK CAPABILITY CARDS */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pb-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <span className="h-1.5 w-6 rounded-full bg-blue-600 block mb-2" />
              <p className="font-bold text-slate-900 text-xs">Room Operations</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Live unit allocation and floor status</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <span className="h-1.5 w-6 rounded-full bg-emerald-500 block mb-2" />
              <p className="font-bold text-slate-900 text-xs">Live Folio Review</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Instant settlement and multi-pay split</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <span className="h-1.5 w-6 rounded-full bg-amber-400 block mb-2" />
              <p className="font-bold text-slate-900 text-xs">Walk-In Booking</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Two-tap guest intake without friction</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <span className="h-1.5 w-6 rounded-full bg-orange-500 block mb-2" />
              <p className="font-bold text-slate-900 text-xs">Priority Clean</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Dispatch rush turn to housekeeping</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
