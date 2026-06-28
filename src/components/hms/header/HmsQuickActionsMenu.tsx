"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { openCheckoutDialog } from "@/lib/hms/open-checkout-bus";

export function HmsQuickActionsMenu({ slug }: { slug: string }) {
  const router = useRouter();
  const base = `/hms/${slug}`;
  const [maintOpen, setMaintOpen] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [maintNotes, setMaintNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const patchRoom = async (payload: { roomCode: string; status: string; notes?: string }) => {
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/frontdesk/room-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not update room", data.error ?? "Try again.");
        return;
      }
      toastSuccess(
        payload.status === "maintenance" ? "Maintenance reported" : "Room marked cleaned",
      );
      setMaintOpen(false);
      setRoomCode("");
      setMaintNotes("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="hidden h-10 rounded-xl sm:inline-flex">
            Quick actions
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2">
          <DropdownMenuLabel className="text-xs text-slate-500">Front desk</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={`${base}/frontdesk/check-in`}>Check in guest</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openCheckoutDialog()}>
            Check out guest
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`${base}/reservations/new`}>Create reservation</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`${base}/frontdesk/check-in`}>Walk-in booking</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              const code = window.prompt("Room number to mark cleaned?");
              if (code?.trim()) void patchRoom({ roomCode: code.trim(), status: "ready_for_occupancy" });
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Mark room cleaned
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMaintOpen(true)}>
            <Wrench className="mr-2 h-4 w-4" />
            Report maintenance
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>Extend stay (coming soon)</DropdownMenuItem>
          <DropdownMenuItem disabled>Change room (coming soon)</DropdownMenuItem>
          <DropdownMenuItem disabled>Add payment (coming soon)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={maintOpen} onOpenChange={setMaintOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report maintenance</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="Room number"
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
            <textarea
              value={maintNotes}
              onChange={(e) => setMaintNotes(e.target.value)}
              placeholder="Issue description"
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={busy || !roomCode.trim()}
              onClick={() =>
                void patchRoom({
                  roomCode: roomCode.trim(),
                  status: "maintenance",
                  notes: maintNotes.trim() || undefined,
                })
              }
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
