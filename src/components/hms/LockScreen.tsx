"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, Lock, UserRound, X } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";

export type LockPerson = {
  userId: string;
  name: string;
  department: string;
  staffLevel: "hod" | "staff";
  hasPin: boolean;
  pinLocked: boolean;
};

type Props = {
  slug: string;
  /** Shown as a full-screen lock the person cannot dismiss. */
  locked: boolean;
  people: LockPerson[];
  /** Lock after this many idle minutes; 0 means never. */
  idleMinutes: number;
  /** Opened from the account menu: pick a person and enter their PIN. */
  switchOpen: boolean;
  onSwitchClose: () => void;
  pinOpen: boolean;
  onPinClose: () => void;
};

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "mousemove", "scroll", "touchstart"] as const;

export default function LockScreen({ slug, locked, people, idleMinutes, switchOpen, onSwitchClose, pinOpen, onPinClose }: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lockNow = useCallback(async () => {
    try {
      const res = await fetch("/api/hotel/session/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (res.ok) window.location.reload();
    } catch {
      /* offline: stay as we are */
    }
  }, [slug]);

  // Lock the screen after a quiet spell. Only runs while unlocked.
  useEffect(() => {
    if (locked || idleMinutes <= 0) return;
    const ms = idleMinutes * 60_000;
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void lockNow(), ms);
    };
    reset();
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, reset, { passive: true });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, reset);
    };
  }, [locked, idleMinutes, lockNow]);

  if (locked) return <PersonPicker slug={slug} people={people} dismissible={false} onClose={() => {}} />;
  return (
    <>
      {switchOpen ? <PersonPicker slug={slug} people={people} dismissible onClose={onSwitchClose} /> : null}
      {pinOpen ? <MyPinPanel slug={slug} onClose={onPinClose} /> : null}
    </>
  );
}

function Overlay({ children, dismissible, onClose }: { children: React.ReactNode; dismissible: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-slate-900/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        {dismissible ? (
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function PersonPicker({ slug, people, dismissible, onClose }: { slug: string; people: LockPerson[]; dismissible: boolean; onClose: () => void }) {
  const [picked, setPicked] = useState<LockPerson | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!picked) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/session/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, userId: picked.userId, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Unable to switch.");
        setPin("");
        return;
      }
      window.location.reload();
    } catch {
      setError("We couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay dismissible={dismissible} onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-slate-700">
          <Lock className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{dismissible ? "Switch user" : "Screen locked"}</h2>
          <p className="text-sm text-slate-500">{picked ? `Enter ${picked.name}'s PIN.` : "Pick your name, then enter your PIN."}</p>
        </div>
      </div>

      {!picked ? (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {people.length === 0 ? <li className="text-sm text-slate-500">Nobody can unlock this screen. Sign out and sign in again.</li> : null}
          {people.map((p) => {
            const unavailable = !p.hasPin || p.pinLocked;
            return (
              <li key={p.userId}>
                <button
                  type="button"
                  disabled={unavailable}
                  onClick={() => {
                    setPicked(p);
                    setPin("");
                    setError("");
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UserRound className="h-4 w-4 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{p.name}</span>
                    <span className="block text-xs text-slate-500">
                      {[p.department, p.staffLevel === "hod" ? "Head" : null].filter(Boolean).join(" · ")}
                      {!p.hasPin ? " · no PIN yet" : p.pinLocked ? " · PIN locked, ask the head" : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="PIN"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-center text-lg tracking-[0.4em] outline-none focus:border-blue-300"
          />
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => setPicked(null)} className="h-10 flex-1 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Back
            </button>
            <button type="submit" disabled={busy || pin.length < 4} className="h-10 flex-1 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Checking…" : "Unlock"}
            </button>
          </div>
        </form>
      )}
      {!picked && error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    </Overlay>
  );
}

function MyPinPanel({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (pin !== confirm) return setError("The two PINs don't match.");
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/staff/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Unable to save the PIN.");
        toastError("PIN not saved", data.error || "Please try again.");
        return;
      }
      toastSuccess("PIN saved");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay dismissible onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-slate-700">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">My PIN</h2>
          <p className="text-sm text-slate-500">4 to 6 digits. Used to unlock the screen and to approve actions. Keep it to yourself.</p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="New PIN" className="h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300" />
        <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} placeholder="Confirm PIN" className="h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300" />
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <button type="submit" disabled={busy || pin.length < 4} className="h-10 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save PIN"}
        </button>
      </form>
    </Overlay>
  );
}
