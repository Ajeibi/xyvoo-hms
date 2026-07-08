"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  notificationTone,
  type FbStatusNotification,
} from "@/lib/hms/fb-status-notifications";
import { cn } from "@/lib/utils";

const TONE_STYLES = {
  positive: {
    bar: "border-emerald-200 bg-emerald-50",
    barTitle: "text-emerald-950",
    item: "border-emerald-200 bg-white",
    itemBtn: "border-emerald-300 bg-white hover:bg-emerald-50",
    modal: "border-emerald-200",
    modalTitle: "text-emerald-950",
    listItem: "border-emerald-100 bg-emerald-50/80",
    primaryBtn: "bg-emerald-600 hover:bg-emerald-700",
    outlineBtn: "border-emerald-300 bg-white",
  },
  default: {
    bar: "border-blue-200 bg-blue-50",
    barTitle: "text-blue-950",
    item: "border-blue-200 bg-white",
    itemBtn: "border-blue-300 bg-white hover:bg-blue-50",
    modal: "border-blue-200",
    modalTitle: "text-blue-950",
    listItem: "border-blue-100 bg-blue-50/80",
    primaryBtn: "bg-blue-600 hover:bg-blue-700",
    outlineBtn: "border-blue-300 bg-white",
  },
} as const;

function dominantTone(pending: FbStatusNotification[]) {
  if (pending.some((n) => notificationTone(n) === "positive")) return "positive";
  return "default";
}

export function FbStatusNotificationBar({
  pending,
  onAcknowledge,
  onAcknowledgeAll,
}: {
  pending: FbStatusNotification[];
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const prevCount = useRef(0);
  const tone = dominantTone(pending);
  const styles = TONE_STYLES[tone];
  const allPositive = pending.every((n) => notificationTone(n) === "positive");

  useEffect(() => {
    if (pending.length > prevCount.current) {
      setModalOpen(true);
    }
    prevCount.current = pending.length;
  }, [pending.length]);

  if (pending.length === 0) return null;

  const ackAllLabel = pending.length === 1 ? "Acknowledge" : "Acknowledge all";
  const headerLabel = allPositive
    ? `${pending.length} order${pending.length === 1 ? "" : "s"} ready for service`
    : `${pending.length} update${pending.length === 1 ? "" : "s"} for you`;

  return (
    <>
      <AlertDialog open={modalOpen} onOpenChange={setModalOpen}>
        <AlertDialogContent className={styles.modal}>
          <AlertDialogHeader>
            <AlertDialogTitle
              className={cn("flex items-center gap-2", styles.modalTitle)}
            >
              {allPositive ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
              ) : (
                <Bell className="h-5 w-5" aria-hidden />
              )}
              {headerLabel}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="max-h-56 space-y-2 overflow-y-auto text-left text-sm text-slate-700">
                {pending.map((note) => {
                  const noteTone = notificationTone(note);
                  const noteStyles = TONE_STYLES[noteTone];
                  return (
                    <li
                      key={note.id}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-slate-900",
                        noteStyles.listItem,
                      )}
                    >
                      {note.message}
                    </li>
                  );
                })}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Keep showing
            </Button>
            <AlertDialogAction
              className={styles.primaryBtn}
              onClick={() => {
                onAcknowledgeAll();
                setModalOpen(false);
              }}
            >
              {ackAllLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div
        role="status"
        aria-live="polite"
        className={cn("border-b px-6 py-3 shadow-sm", styles.bar)}
      >
        <div className="flex w-full flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className={cn("flex items-center gap-2 text-sm font-semibold", styles.barTitle)}>
              {allPositive ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <Bell className="h-4 w-4 shrink-0" aria-hidden />
              )}
              {headerLabel}
            </div>
            <ul className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
              {pending.map((note) => (
                <li
                  key={note.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm text-slate-800",
                    styles.item,
                  )}
                >
                  <span>{note.message}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn("h-7 shrink-0 text-xs", styles.itemBtn)}
                    onClick={() => onAcknowledge(note.id)}
                  >
                    Acknowledge
                  </Button>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={styles.outlineBtn}
              onClick={() => setModalOpen(true)}
            >
              View
            </Button>
            <Button
              type="button"
              size="sm"
              className={styles.primaryBtn}
              onClick={onAcknowledgeAll}
            >
              {ackAllLabel}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
