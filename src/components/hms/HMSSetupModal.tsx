"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BedDouble, Building2, Check, CircleDashed, Palette, Settings, ShieldCheck, Users, X } from "lucide-react";
import type { HotelDashboardTourStatus } from "@/types";
import type { HMSSetupTask } from "@/lib/hms/setup";
import { hmsButton } from "./hms-ui";
import { HMS_MEANING, type HmsMeaning } from "./meaning";

type HMSSetupModalProps = {
  slug: string;
  initialTourStatus: HotelDashboardTourStatus;
  showModal: boolean;
  tasks: HMSSetupTask[];
};

const TASK_LOOK: Record<HMSSetupTask["id"], { icon: React.ComponentType<{ className?: string }>; meaning: HmsMeaning }> = {
  branding: { icon: Palette, meaning: "guests" },
  "floor-plan": { icon: Building2, meaning: "rooms" },
  "room-pricing": { icon: BedDouble, meaning: "rooms" },
  "department-access": { icon: Users, meaning: "team" },
};

export default function HMSSetupModal({
  slug,
  initialTourStatus,
  showModal,
  tasks,
}: HMSSetupModalProps) {
  const [open, setOpen] = useState(showModal && initialTourStatus !== "pending");

  useEffect(() => {
    if (!showModal || initialTourStatus !== "pending") {
      return;
    }

    const onTourFinished = () => setOpen(true);
    window.addEventListener("hms-tour-finished", onTourFinished);
    return () => window.removeEventListener("hms-tour-finished", onTourFinished);
  }, [initialTourStatus, showModal]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!showModal || !open) return null;

  const doneCount = tasks.filter((t) => t.complete).length;
  const percent = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const nextId = tasks.find((t) => !t.complete)?.id;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hms-setup-modal-title"
        aria-describedby="hms-setup-modal-desc"
        className="relative my-auto flex w-full max-w-2xl max-h-[min(90vh,calc(100vh-3rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <button
          type="button"
          aria-label="Close setup guidance"
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white/80 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-br from-blue-50 via-white to-emerald-50/60 px-6 py-6 pr-14 sm:px-8">
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-medium text-blue-800 ring-1 ring-blue-100">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Setup for owners and admins
          </p>
          <h2 id="hms-setup-modal-title" className="mt-4 font-heading text-2xl font-bold text-slate-900">
            A few setup steps are still to do
          </h2>
          <p id="hms-setup-modal-desc" className="mt-2 max-w-xl text-sm leading-6 text-slate-700">
            Finish these and your hotel is ready for daily use. We&apos;ll keep reminding owners and admins until
            they&apos;re done.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <div
              role="progressbar"
              aria-label="Setup progress"
              aria-valuemin={0}
              aria-valuemax={tasks.length}
              aria-valuenow={doneCount}
              aria-valuetext={`${doneCount} of ${tasks.length} steps done`}
              className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"
            >
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
            </div>
            <span className="shrink-0 text-sm font-medium text-slate-700">
              {doneCount} of {tasks.length} done
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          <ol className="space-y-3">
            {tasks.map((task) => {
              const look = TASK_LOOK[task.id] ?? { icon: Settings, meaning: "neutral" as const };
              const Icon = look.icon;
              const tone = HMS_MEANING[look.meaning];
              const isNext = task.id === nextId;
              return (
                <li
                  key={task.id}
                  className={`flex items-start gap-4 rounded-2xl border p-4 ${
                    isNext ? "border-blue-200 bg-blue-50/50" : "border-slate-200 bg-white"
                  }`}
                >
                  <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.tint} ${tone.icon}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-sm font-semibold ${task.complete ? "text-slate-600" : "text-slate-900"}`}>{task.title}</p>
                      {task.complete ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          Done
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                          <CircleDashed className="h-3.5 w-3.5" aria-hidden />
                          To do
                        </span>
                      )}
                    </div>
                    {!task.complete ? <p className="mt-1 text-sm leading-6 text-slate-600">{task.description}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 rounded-2xl bg-blue-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Where to start</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              Start in Settings to finish branding, floors and room counts, room types and pricing, and department
              access. Then use the Setup Wizard to check the rest of your go-live list.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={`/hms/${slug}/settings`} className={hmsButton.primary}>
              <Settings className="h-4 w-4" aria-hidden />
              Go to Settings
            </Link>
            <Link href={`/hms/${slug}/setup`} className={hmsButton.secondary}>
              Open Setup Wizard
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:ml-auto"
            >
              I&apos;ll do this later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
