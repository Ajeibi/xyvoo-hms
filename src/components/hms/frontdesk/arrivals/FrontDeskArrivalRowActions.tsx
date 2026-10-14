"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ArrivalWorkbenchRow } from "@/lib/hms/arrivals-workbench";
import type { ArrivalsRoleCapabilities } from "@/lib/hms/arrivals-rbac";

export function FrontDeskArrivalRowActions({
  slug,
  row,
  capabilities,
  onDetail,
  onAssign,
  onCheckIn,
}: {
  slug: string;
  row: ArrivalWorkbenchRow;
  capabilities: ArrivalsRoleCapabilities;
  onDetail: () => void;
  onAssign: () => void;
  onCheckIn: () => void;
}) {
  const canCheckIn = capabilities.canCheckIn && row.status === "confirmed";
  const canAssign = capabilities.canAssignRoom && row.status === "confirmed";

  return (
    <div
      className="flex items-center justify-end gap-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {canCheckIn ? (
        <Button type="button" size="sm" className="shrink-0 rounded-xl px-3 font-semibold" onClick={onCheckIn}>
          Check in<span className="sr-only"> {row.guestName}</span>
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" className="shrink-0 rounded-xl border-slate-300 px-3" onClick={onDetail}>
          Details<span className="sr-only"> for {row.guestName}</span>
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-8 shrink-0 rounded-xl border-slate-300 p-0"
            aria-label={`More actions for ${row.guestName}`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {canCheckIn ? <DropdownMenuItem onClick={onDetail}>View details</DropdownMenuItem> : null}
          {canAssign ? <DropdownMenuItem onClick={onAssign}>Assign room</DropdownMenuItem> : null}
          {(canCheckIn || canAssign) ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem asChild>
            <Link href={`/hms/${slug}/frontdesk/folio?code=${encodeURIComponent(row.confirmationCode)}`}>
              Open folio
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
