"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Coffee, Delete, LogIn, LogOut } from "lucide-react";
import { formatDay, isoToLocalTime, type Shift } from "@/lib/hms/hr/hr-shared";
import type { KioskState } from "@/lib/hms/hr/hr-kiosk";
import { KioskSelfService } from "@/components/hms/hr/KioskSelfService";

const IDLE_MS = 60_000;

export type KioskCall = (action: string, extra?: Record<string, unknown>) => Promise<boolean>;

/**
 * The tablet camera, kept open while the clock screen is up so each photo is instant. Returns a
 * video ref to show the preview, a capture function (a small JPEG data URL, or null if the camera
 * isn't available) and whether the camera is working.
 */
function useCamera(enabled: boolean) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"off" | "starting" | "on" | "blocked">(enabled ? "starting" : "off");
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      const t = setTimeout(() => setStatus("blocked"), 0);
      return () => clearTimeout(t);
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream.current = s;
        setStatus("on");
      })
      .catch(() => {
        if (!cancelled) setStatus("blocked");
      });
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((tr) => tr.stop());
      stream.current = null;
    };
  }, [enabled]);
  // Attach the stream whenever the preview element appears.
  const attach = useCallback((el: HTMLVideoElement | null) => {
    video.current = el;
    if (el && stream.current && el.srcObject !== stream.current) {
      el.srcObject = stream.current;
      void el.play().catch(() => undefined);
    }
  }, []);
  const capture = useCallback((): string | null => {
    const v = video.current;
    if (!v || !stream.current || !v.videoWidth) return null;
    const w = 320;
    const h = Math.round((v.videoHeight / v.videoWidth) * w) || 240;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.7);
  }, []);
  return { attach, capture, status };
}

export function KioskClient({ token, hotelName, photo = false }: { token: string; hotelName: string; photo?: boolean }) {
  const { attach: attachCamera, capture: capturePhoto, status: cameraStatus } = useCamera(photo);
  const [now, setNow] = useState<Date | null>(null);
  const [pin, setPin] = useState("");
  const [state, setState] = useState<KioskState | null>(null);
  const [selfService, setSelfService] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setPin("");
    setState(null);
    setError("");
  }, []);

  const touch = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(reset, IDLE_MS);
  }, [reset]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const call: KioskCall = useCallback(
    async (action, extra = {}) => {
      touch();
      setBusy(true);
      setError("");
      try {
        const res = await fetch(`/api/hotel/hr/kiosk/${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin, action, ...extra }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? "Something went wrong. Try again.");
          if (res.status === 401) setPin("");
          return false;
        }
        setState(json.state);
        setSelfService(json.selfService !== false);
        if (json.message) setMessage(json.message);
        return true;
      } catch {
        setError("Couldn't reach the server. Check the internet connection.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [pin, token, touch],
  );

  // After clocking in or out, clear the screen for the next person.
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(t);
  }, [message]);

  const press = (d: string) => {
    touch();
    setPin((p) => (p.length < 6 ? p + d : p));
  };

  async function doClock(action: "clock_in" | "clock_out" | "break_start" | "break_end") {
    const shot = photo && (action === "clock_in" || action === "clock_out") ? capturePhoto() : null;
    const ok = await call(action, shot ? { photo: shot } : {});
    if (ok && (action === "clock_in" || action === "clock_out")) setTimeout(reset, 2500);
  }

  return (
    <div className="space-y-6">
      <header className="text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{hotelName}</p>
        <p className="mt-1 text-5xl font-semibold tabular-nums text-slate-900" aria-live="off">
          {now ? now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }) : "--:--"}
        </p>
        <p className="min-h-6 text-slate-600">{now ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" }) : ""}</p>
      </header>

      {/* A fixed-height slot, so a note appearing or clearing never moves the keypad under a finger. */}
      <div className="flex min-h-[4.5rem] items-center" aria-live="polite">
        {error ? (
          <p role="alert" className="w-full rounded-2xl bg-red-50 px-4 py-3 text-center font-medium text-red-800">
            {error}
          </p>
        ) : message ? (
          <p role="status" className="w-full rounded-2xl bg-emerald-50 px-4 py-3 text-center text-lg font-medium text-emerald-800">
            {message}
          </p>
        ) : null}
      </div>

      {!state ? (
        <form
          className="mx-auto max-w-xs space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (pin.length >= 4) void call("identify");
          }}
        >
          <label htmlFor="kiosk-pin" className="block text-center text-lg font-medium text-slate-800">
            Type your PIN
          </label>
          <input
            id="kiosk-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              touch();
              setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
            }}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-center text-3xl tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} type="button" onClick={() => press(d)} className="rounded-2xl border border-slate-200 bg-white py-4 text-2xl font-semibold text-slate-900 shadow-sm active:bg-slate-100">
                {d}
              </button>
            ))}
            <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-4 text-slate-700" aria-label="Delete last number">
              <Delete className="h-6 w-6" aria-hidden />
            </button>
            <button type="button" onClick={() => press("0")} className="rounded-2xl border border-slate-200 bg-white py-4 text-2xl font-semibold text-slate-900 shadow-sm">
              0
            </button>
            <button type="submit" disabled={busy || pin.length < 4} className="rounded-2xl bg-xyvoo-blue-deep py-4 text-lg font-semibold text-white disabled:opacity-50">
              OK
            </button>
          </div>
        </form>
      ) : (
        <section className="space-y-5" onClick={touch}>
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-slate-900">Hello, {state.firstName}</h1>
            <p className="text-slate-600">
              {state.clockedIn
                ? state.onBreak
                  ? "You're on a break."
                  : `Clocked in since ${state.clockedInAt ? isoToLocalTime(state.clockedInAt) : ""}.`
                : "You're not clocked in."}
            </p>
          </div>
          {photo ? (
            <div className="flex items-center justify-center gap-3 text-sm text-slate-600">
              {cameraStatus === "on" ? (
                <video ref={attachCamera} muted playsInline className="h-20 w-28 rounded-xl bg-slate-200 object-cover" aria-label="Camera preview" />
              ) : null}
              <span>{cameraStatus === "blocked" ? "The camera isn't available, so no photo will be taken. Tell a manager." : "A photo is taken when you clock in or out."}</span>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {!state.clockedIn ? (
              <BigButton onClick={() => void doClock("clock_in")} disabled={busy} icon={LogIn} tone="primary">
                Clock in
              </BigButton>
            ) : (
              <>
                {state.onBreak ? (
                  <BigButton onClick={() => void doClock("break_end")} disabled={busy} icon={Coffee}>
                    End break
                  </BigButton>
                ) : (
                  <BigButton onClick={() => void doClock("break_start")} disabled={busy} icon={Coffee}>
                    Start break
                  </BigButton>
                )}
                <BigButton onClick={() => void doClock("clock_out")} disabled={busy} icon={LogOut} tone="primary">
                  Clock out
                </BigButton>
              </>
            )}
          </div>
          <MyShifts shifts={state.myShifts} />
          {selfService ? <KioskSelfService state={state} call={call} busy={busy} /> : null}
          <button type="button" onClick={reset} className="w-full rounded-2xl border border-slate-300 py-3 font-medium text-slate-800">
            Done
          </button>
        </section>
      )}
    </div>
  );
}

function BigButton({
  children,
  onClick,
  disabled,
  icon: Icon,
  tone = "secondary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-3 rounded-2xl px-4 py-5 text-xl font-semibold shadow-sm disabled:opacity-50 ${
        tone === "primary" ? "bg-xyvoo-blue-deep text-white" : "border border-slate-300 bg-white text-slate-900"
      }`}
    >
      <Icon className="h-6 w-6" aria-hidden /> {children}
    </button>
  );
}

function MyShifts({ shifts }: { shifts: Shift[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        <Clock className="h-4 w-4" aria-hidden /> Your next shifts
      </h2>
      {shifts.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">No shifts in the next two weeks.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {shifts.slice(0, 10).map((s) => (
            <li key={s.id} className="flex justify-between gap-2 py-1.5">
              <span className="text-slate-800">{formatDay(s.shiftDate)}</span>
              <span className="tabular-nums text-slate-700">
                {isoToLocalTime(s.startsAt)}–{isoToLocalTime(s.endsAt)}
                {s.position ? ` · ${s.position}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
