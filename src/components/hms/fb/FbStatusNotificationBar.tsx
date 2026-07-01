"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
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
import type { FbStatusNotification } from "@/lib/hms/fb-status-notifications";

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

  useEffect(() => {
    if (pending.length > prevCount.current) {
      setModalOpen(true);
    }
    prevCount.current = pending.length;
  }, [pending.length]);

  if (pending.length === 0) return null;

  return (
    <>
      <AlertDialog open={modalOpen} onOpenChange={setModalOpen}>
        <AlertDialogContent className="border-amber-300">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-900">
              <Bell className="h-5 w-5" aria-hidden />
              Order updates ({pending.length})
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="max-h-56 space-y-2 overflow-y-auto text-left text-sm text-slate-700">
                {pending.map((note) => (
                  <li
                    key={note.id}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-slate-900"
                  >
                    {note.message}
                  </li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Keep showing
            </Button>
            <AlertDialogAction
              onClick={() => {
                onAcknowledgeAll();
                setModalOpen(false);
              }}
            >
              Acknowledge all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div
        role="status"
        aria-live="polite"
        className="border-b border-amber-300 bg-amber-100 px-6 py-3 shadow-sm"
      >
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
              <Bell className="h-4 w-4 shrink-0" aria-hidden />
              Order updates waiting — {pending.length} unacknowledged
            </div>
            <ul className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
              {pending.map((note) => (
                <li
                  key={note.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/80 bg-white px-3 py-2 text-sm text-slate-800"
                >
                  <span>{note.message}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 border-amber-400 bg-white text-xs"
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
              className="border-amber-400 bg-white"
              onClick={() => setModalOpen(true)}
            >
              View
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-amber-700 hover:bg-amber-800"
              onClick={onAcknowledgeAll}
            >
              Acknowledge all
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
