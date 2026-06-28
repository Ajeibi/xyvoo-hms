"use client";

import Link from "next/link";
import { UserPlus, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openCheckoutDialog } from "@/lib/hms/open-checkout-bus";

export function FrontDeskQuickActionsBar({ slug }: { slug: string }) {
  return (
    <section className="mt-6 flex flex-wrap gap-3">
      <Button asChild className="h-11 rounded-xl px-5 font-semibold shadow-sm">
        <Link href={`/hms/${slug}/frontdesk/check-in`}>
          <UserPlus className="mr-2 h-4 w-4" />
          Check in guest
        </Link>
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 rounded-xl border-orange-200 px-5 font-semibold text-orange-800 shadow-sm hover:bg-orange-50"
        onClick={() => openCheckoutDialog()}
      >
        <LogOut className="mr-2 h-4 w-4" />
        Check out guest
      </Button>
      <Button asChild variant="ghost" className="h-11 rounded-xl text-slate-600">
        <Link href={`/hms/${slug}/frontdesk/arrivals`}>Arrivals</Link>
      </Button>
    </section>
  );
}
