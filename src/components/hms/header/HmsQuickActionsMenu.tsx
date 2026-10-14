"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ChevronDown, LogIn, LogOut, Sparkles, UserPlus, Wrench } from "lucide-react";
import { HmsField, hmsInput } from "@/components/hms/hms-ui";
import { HMS_MEANING, type HmsMeaning } from "@/components/hms/meaning";
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

function ActionIcon({ icon: Icon, meaning }: { icon: React.ComponentType<{ className?: string }>; meaning: HmsMeaning }) {
  const tone = HMS_MEANING[meaning];
  return (
    <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone.tint} ${tone.icon}`}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

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
        <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2">
          <DropdownMenuLabel className="text-sm font-semibold text-slate-700">Front desk</DropdownMenuLabel>
          <DropdownMenuItem asChild className="gap-2.5 rounded-xl">
            <Link href={`${base}/frontdesk/check-in`}>
              <ActionIcon icon={LogIn} meaning="rooms" />
              Check in a guest
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2.5 rounded-xl" onSelect={() => openCheckoutDialog()}>
            <ActionIcon icon={LogOut} meaning="rooms" />
            Check out a guest
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-2.5 rounded-xl">
            <Link href={`${base}/reservations/new`}>
              <ActionIcon icon={CalendarPlus} meaning="rooms" />
              New reservation
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-2.5 rounded-xl">
            <Link href={`${base}/frontdesk/check-in`}>
              <ActionIcon icon={UserPlus} meaning="guests" />
              Walk-in booking
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-sm font-semibold text-slate-700">Rooms</DropdownMenuLabel>
          <DropdownMenuItem
            className="gap-2.5 rounded-xl"
            onClick={() => {
              const code = window.prompt("Room number to mark cleaned?");
              if (code?.trim()) void patchRoom({ roomCode: code.trim(), status: "ready_for_occupancy" });
            }}
          >
            <ActionIcon icon={Sparkles} meaning="care" />
            Mark a room as cleaned
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2.5 rounded-xl" onClick={() => setMaintOpen(true)}>
            <ActionIcon icon={Wrench} meaning="care" />
            Report a repair
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-sm font-semibold text-slate-700">Coming soon</DropdownMenuLabel>
          <DropdownMenuItem disabled className="rounded-xl">Extend a stay</DropdownMenuItem>
          <DropdownMenuItem disabled className="rounded-xl">Change room</DropdownMenuItem>
          <DropdownMenuItem disabled className="rounded-xl">Add a payment</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={maintOpen} onOpenChange={setMaintOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report a repair</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <HmsField id="quick-maint-room" label="Room number">
              <input
                id="quick-maint-room"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                className={hmsInput}
              />
            </HmsField>
            <HmsField id="quick-maint-notes" label="What's wrong?" optional hint="For example: the shower drips and won't turn off fully.">
              <textarea
                id="quick-maint-notes"
                value={maintNotes}
                onChange={(e) => setMaintNotes(e.target.value)}
                aria-describedby="quick-maint-notes-hint"
                rows={3}
                className={hmsInput}
              />
            </HmsField>
          </div>
          <DialogFooter>
            <Button
              type="button"
              className="rounded-xl"
              disabled={busy || !roomCode.trim()}
              onClick={() =>
                void patchRoom({
                  roomCode: roomCode.trim(),
                  status: "maintenance",
                  notes: maintNotes.trim() || undefined,
                })
              }
            >
              {busy ? "Sending…" : "Report repair"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
