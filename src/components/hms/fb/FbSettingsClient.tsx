"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FbSettingsClient({ slug }: { slug: string }) {
  const settingsMenuUrl = `/hms/${slug}/settings#menu-setup`;

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">F&amp;B settings</h1>
        <p className="text-sm text-slate-500">Operational shortcuts for food &amp; beverage setup.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">
          Menu sections, categories, items, kitchen stations, and restaurant tables are all managed
          centrally in Settings so every outlet stays in sync with POS and the guest menu.
        </p>
        <Button asChild className="gap-2">
          <Link href={settingsMenuUrl}>
            <ExternalLink className="h-4 w-4" />
            Open menu setup
          </Link>
        </Button>
        <p className="text-xs text-slate-500">
          Tip: select the <strong>Restaurant</strong> section in menu setup to add floor tables.
        </p>
      </div>
    </div>
  );
}
