"use client";

import Link from "next/link";
import { UserPlus, LogOut, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openCheckoutDialog } from "@/lib/hms/open-checkout-bus";

export function FrontDeskQuickActionsBar({ slug }: { slug: string }) {
  return (
    <section className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
      <Button asChild className="col-span-2 h-11 w-full rounded-xl px-5 font-semibold shadow-sm sm:col-span-1 sm:w-auto">
        <Link href={`/hms/${slug}/frontdesk/check-in`}>
          <UserPlus className="mr-2 h-4 w-4" />
          Check in guest
        </Link>
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full rounded-xl border-orange-200 px-3 font-semibold text-orange-800 shadow-sm hover:bg-orange-50 sm:w-auto sm:px-5"
        onClick={() => openCheckoutDialog()}
      >
        <LogOut className="mr-2 h-4 w-4" />
        Check out guest
      </Button>
      <Button
        asChild
        variant="outline"
        className="h-11 w-full rounded-xl border-sky-200 px-3 font-semibold text-sky-800 shadow-sm hover:bg-sky-50 sm:w-auto sm:border-transparent sm:bg-transparent sm:px-4 sm:font-medium sm:text-slate-600 sm:shadow-none sm:hover:bg-accent sm:hover:text-accent-foreground"
      >
        <Link href={`/hms/${slug}/frontdesk/arrivals`}>
          <CalendarCheck className="mr-2 h-4 w-4 sm:hidden" />
          Arrivals
        </Link>
      </Button>
    </section>
  );
}
