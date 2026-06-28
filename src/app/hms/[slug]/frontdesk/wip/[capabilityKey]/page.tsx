import Link from "next/link";
import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import {
  FRONT_DESK_ACCENT_BORDER_CLASS,
  FRONT_DESK_ACCENT_WELL_CLASS,
  getFrontDeskCapabilityByKey,
} from "@/lib/hms/frontdesk-capabilities";
import { cn } from "@/lib/utils";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";

export default async function FrontDeskWipCapabilityPage({
  params,
}: {
  params: Promise<{ slug: string; capabilityKey: string }>;
}) {
  const { slug, capabilityKey } = await params;
  const capability = getFrontDeskCapabilityByKey(capabilityKey);

  if (!capability) {
    notFound();
  }

  const hubHref = `/hms/${slug}/frontdesk`;

  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <div className="mx-auto w-full max-w-[1500px] px-6 py-8 sm:px-8">
        <Link
          href={hubHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to front desk hub
        </Link>

        <div
          className={cn(
            "mt-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm shadow-slate-200/30",
            "border-l-4 pl-5 sm:pl-6",
            FRONT_DESK_ACCENT_BORDER_CLASS[capability.accent],
          )}
        >
          <div className="px-6 py-6 sm:px-7 sm:py-7">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                  FRONT_DESK_ACCENT_WELL_CLASS[capability.accent],
                )}
              >
                <FileSpreadsheet className="h-6 w-6" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Workspace
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  {capability.title}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">{capability.subtitle}</p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-5">
              <p className="text-sm font-semibold text-slate-900">Coming soon</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                This capability is defined in the Front Desk PRD v1 UI shell. Backend workflows and
                screens will be wired here in a later phase.
              </p>
            </div>
          </div>
        </div>
      </div>
    </HMSLayout>
  );
}
