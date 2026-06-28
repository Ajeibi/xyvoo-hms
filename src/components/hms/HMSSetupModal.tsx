"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, Settings, ShieldCheck, X } from "lucide-react";
import type { HotelDashboardTourStatus } from "@/types";
import type { HMSSetupTask } from "@/lib/hms/setup";

type HMSSetupModalProps = {
  slug: string;
  initialTourStatus: HotelDashboardTourStatus;
  showModal: boolean;
  tasks: HMSSetupTask[];
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

  if (!showModal || !open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]">
      <div className="relative my-auto flex w-full max-w-2xl max-h-[min(90vh,calc(100vh-3rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <button
          type="button"
          aria-label="Close setup guidance"
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-8 py-7 pr-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-semibold text-blue-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Owner/Admin setup guidance
          </div>
          <h2 className="mt-4 text-2xl font-bold text-slate-900">
            A few setup steps are still pending
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Before the HMS is fully ready for daily operations, complete the remaining
            setup items below. This reminder will keep showing for owner and admin
            users until the required setup is done.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
          <div className="space-y-4">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="mt-0.5 shrink-0">
                  {task.complete ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <CircleAlert className="h-5 w-5 text-amber-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        task.complete
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {task.complete ? "Completed" : "Pending"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{task.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <p className="text-sm font-medium text-slate-900">Next best action</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Start in Settings to finish branding, floors and room counts, room types and pricing,
              and department access. Then use the Setup Wizard to review your broader go-live checklist.
            </p>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={`/hms/${slug}/settings`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <Settings className="h-4 w-4" />
              Go to Settings
            </Link>
            <Link
              href={`/hms/${slug}/setup`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Open Setup Wizard
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 sm:ml-auto"
            >
              I&apos;ll do this later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
