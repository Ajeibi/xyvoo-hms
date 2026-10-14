"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Any HMS page that could not load its data (for example the database timed out) lands here
 * instead of rendering a half-empty screen. The navigation around it stays usable.
 */
export default function HmsPageError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[hms page]", error.digest ?? "", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div role="alert" className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-slate-900">This page couldn&apos;t load</h1>
        <p className="mt-2 text-sm text-slate-600">
          We couldn&apos;t get the latest information just now. Nothing you&apos;ve saved has been lost. Please try
          again in a moment.
        </p>
        <Button type="button" className="mt-6" onClick={() => unstable_retry()}>
          Try again
        </Button>
        {error.digest ? <p className="mt-4 text-xs text-slate-400">Reference: {error.digest}</p> : null}
      </div>
    </div>
  );
}
