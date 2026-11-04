"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Camera } from "lucide-react";
import { SignaturePad } from "@/components/hms/SignaturePad";
import { ALL_COUNTRIES } from "@/lib/store/countries";
import { ARRIVAL_TIMES, idRequired, type IdPolicy } from "@/lib/hms/online-checkin-shared";
import { cn } from "@/lib/utils";

type Stay = {
  hotel: string;
  confirmationCode: string;
  status: string;
  arrivalAt: string;
  departureAt: string;
  nights: number;
  adults: number;
  roomTypeName: string;
  guest: { name: string; email: string | null; phone: string | null; nationality: string | null };
  depositDue: number;
  idRequired: boolean;
  idPolicy: IdPolicy;
  hotelCountry: string;
  idPhotos: number;
  completed: boolean;
};

const fieldClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900";
const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** The page a guest opens from the link in their email or WhatsApp to check in before arriving. */
export function OnlineCheckInForm({ token }: { token: string }) {
  const url = `/api/hotel/online-checkin/${encodeURIComponent(token)}`;
  const [stay, setStay] = useState<Stay | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nationality, setNationality] = useState("NG");
  const [arrivalTime, setArrivalTime] = useState("");
  const [requests, setRequests] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [photos, setPhotos] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setProblem(j.error ?? "This link isn't right.");
          return;
        }
        const s = j as Stay;
        setStay(s);
        setPhone(s.guest.phone ?? "");
        setEmail(s.guest.email ?? "");
        setNationality(s.guest.nationality ?? "NG");
        setPhotos(s.idPhotos);
      })
      .catch(() => setProblem("Could not open this page. Check your connection and try again."));
  }, [url]);

  async function uploadPhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("photo", file);
      body.set("side", photos === 0 ? "front" : "back");
      const res = await fetch(`${url}/id-photo`, { method: "POST", body });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setError(j.error ?? "Could not add the photo.");
      else setPhotos(j.photos ?? photos + 1);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          email: email.trim() || null,
          nationality,
          arrivalTime: arrivalTime || null,
          requests: requests.trim() || null,
          agreed,
          signature,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Could not send your check-in.");
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (problem) return <p role="alert" className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-800">{problem}</p>;
  if (!stay) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" aria-label="Loading" />;

  if (done || stay.completed) {
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" aria-hidden />
        <h1 className="font-heading text-xl font-bold text-slate-900">You are checked in online</h1>
        <p className="text-slate-700">
          {stay.hotel} has your details. When you arrive on {longDate(stay.arrivalAt)}, tell the desk your name and collect your key.
        </p>
        {stay.depositDue > 0 ? (
          <p className="text-slate-700">A deposit of {stay.depositDue.toLocaleString()} is still due. Please pay it at the desk when you arrive.</p>
        ) : null}
      </div>
    );
  }
  if (stay.status !== "confirmed") {
    return <p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-800">This booking can no longer be checked in online. Please see the front desk.</p>;
  }

  const needId = idRequired(stay.idPolicy, nationality, stay.hotelCountry);
  const ready = phone.trim().length >= 6 && agreed && signature && (!needId || photos > 0);

  return (
    <form
      className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div>
        <h1 className="font-heading text-xl font-bold text-slate-900">Check in online at {stay.hotel}</h1>
        <p className="mt-1 text-sm text-slate-600">Hello {stay.guest.name}. Confirm your details and sign, and the desk will have it ready when you arrive.</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
        <div><dt className="text-slate-600">Booking</dt><dd className="font-medium text-slate-900">{stay.confirmationCode}</dd></div>
        <div><dt className="text-slate-600">Room</dt><dd className="font-medium text-slate-900">{stay.roomTypeName}</dd></div>
        <div><dt className="text-slate-600">Arrive</dt><dd className="font-medium text-slate-900">{longDate(stay.arrivalAt)}</dd></div>
        <div><dt className="text-slate-600">Leave</dt><dd className="font-medium text-slate-900">{longDate(stay.departureAt)}</dd></div>
      </dl>

      {stay.depositDue > 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          A deposit of <strong>{stay.depositDue.toLocaleString()}</strong> is due. You can pay it at the front desk when you arrive.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-slate-900">
          Phone number
          <input className={fieldClass} inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-900">
          Email (optional)
          <input className={fieldClass} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-900">
          Country you are from
          <select className={cn(fieldClass, "cursor-pointer")} value={nationality} onChange={(e) => setNationality(e.target.value)}>
            {ALL_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-900">
          About what time will you arrive?
          <select className={cn(fieldClass, "cursor-pointer")} value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)}>
            <option value="">Not sure</option>
            {ARRIVAL_TIMES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1 text-sm font-medium text-slate-900">
        Anything we should know? (optional)
        <textarea className={cn(fieldClass, "min-h-[90px] py-2")} maxLength={500} value={requests} onChange={(e) => setRequests(e.target.value)} />
      </label>

      {needId ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-900">Photo of your ID</p>
          <p className="text-xs text-slate-600">A passport or national ID. Only the hotel can see it.</p>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            id="id-photo-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadPhoto(f);
            }}
          />
          <label
            htmlFor="id-photo-input"
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
            {photos === 0 ? "Take or choose a photo" : "Add another photo"}
          </label>
          {photos > 0 ? <p className="text-sm text-green-700">{photos} photo{photos === 1 ? "" : "s"} added.</p> : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-900">Your signature</p>
        <SignaturePad onChange={setSignature} label="Sign in the box" />
      </div>

      <label className="flex items-start gap-3 text-sm text-slate-800">
        <input type="checkbox" className="mt-0.5 h-5 w-5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>The details above are right, and I agree to the hotel&apos;s house rules and registration terms.</span>
      </label>

      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <button
        type="submit"
        disabled={busy || !ready}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Check in
      </button>
    </form>
  );
}
