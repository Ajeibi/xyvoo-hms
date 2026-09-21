"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Palette,
  RefreshCw,
  Zap,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { INPUT_CLASS } from "@/features/hotel-register/constants";
import { passwordStrength } from "@/features/hotel-register/utils";

const STEPS = [
  { id: 1, label: "Account & Billing", icon: CreditCard },
  { id: 2, label: "Property Identity", icon: Building2 },
  { id: 3, label: "Branding", icon: Palette },
  { id: 4, label: "Review & Activate", icon: Zap },
];

const PLAN_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
] as const;

type Plan = (typeof PLAN_OPTIONS)[number]["value"];

type FormState = {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  password: string;
  plan: Plan;
  hotelName: string;
  subdomain: string;
  roomCount: string;
  country: string;
  city: string;
  address: string;
  hotelType: string;
  logoUrl: string;
};

function emptyForm(): FormState {
  return {
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    password: "",
    plan: "monthly",
    hotelName: "",
    subdomain: "",
    roomCount: "",
    country: "",
    city: "",
    address: "",
    hotelType: "",
    logoUrl: "",
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 63);
}

function isStrongPasswordClient(pw: string) {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
}

function generatePassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%*?";
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = 0; i < 8; i++) chars.push(pick(all));
  return chars.sort(() => Math.random() - 0.5).join("");
}

export default function OnboardPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [result, setResult] = useState<{ slug: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const pwStrength = passwordStrength(form.password);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  function setHotelName(value: string) {
    setForm((s) => ({
      ...s,
      hotelName: value,
      subdomain: subdomainTouched ? s.subdomain : slugify(value),
    }));
  }

  const step1Valid = form.contactName.trim() && /\S+@\S+\.\S+/.test(form.contactEmail) && isStrongPasswordClient(form.password);
  const step2Valid = form.hotelName.trim() && slugify(form.subdomain).length >= 2;

  const canContinue = step === 1 ? step1Valid : step === 2 ? step2Valid : true;

  const copyCredentials = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${form.contactEmail}\nTemporary password: ${form.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied — the fields are still visible to copy manually.
    }
  };

  const activate = async () => {
    setError(null);
    setActivating(true);
    try {
      const res = await fetch("/api/platform/onboard-hotel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName: form.contactName.trim(),
          contactEmail: form.contactEmail.trim(),
          contactPhone: form.contactPhone.trim() || undefined,
          password: form.password,
          plan: form.plan,
          hotelName: form.hotelName.trim(),
          subdomain: slugify(form.subdomain),
          roomCount: form.roomCount ? Number(form.roomCount) : undefined,
          country: form.country.trim() || undefined,
          city: form.city.trim() || undefined,
          address: form.address.trim() || undefined,
          hotelType: form.hotelType.trim() || undefined,
          logoUrl: form.logoUrl.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not activate this hotel. Try again.");
        return;
      }
      setResult({ slug: data.slug });
    } catch {
      setError("Network error — could not reach the server. Try again.");
    } finally {
      setActivating(false);
    }
  };

  const finalSubdomain = useMemo(() => slugify(form.subdomain), [form.subdomain]);

  if (result) {
    return (
      <AdminLayout>
        <div className="px-8 py-8 max-w-2xl mx-auto">
          <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-500" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">{form.hotelName} is live</h1>
            <p className="text-sm text-slate-500 mt-1">
              Tenant provisioned at <span className="font-mono text-slate-700">{result.slug}</span>. Share these sign-in
              details with the hotel owner now — they won&apos;t be shown again.
            </p>

            <div className="mt-6 text-left bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <p className="text-sm text-slate-700">
                <span className="font-medium">Email:</span> {form.contactEmail}
              </p>
              <p className="text-sm text-slate-700">
                <span className="font-medium">Temporary password:</span> <span className="font-mono">{form.password}</span>
              </p>
              <button
                type="button"
                onClick={copyCredentials}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" /> {copied ? "Copied" : "Copy email & password"}
              </button>
            </div>

            <div className="flex gap-3 justify-center mt-6">
              <Link
                href="/tenants"
                className="px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                View all tenants
              </Link>
              <button
                type="button"
                onClick={() => {
                  setForm(emptyForm());
                  setSubdomainTouched(false);
                  setStep(1);
                  setResult(null);
                }}
                className="px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Onboard another hotel
              </button>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="px-8 py-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-slate-900">Onboard New Hotel</h1>
          <p className="text-sm text-slate-500 mt-0.5">Get this hotel live on XYVOO in minutes</p>
        </div>

        <div className="flex items-center mb-8 gap-1">
          {STEPS.map((s, i) => {
            const done = step > s.id;
            const active = step === s.id;
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-center flex-1 min-w-0">
                <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg w-full transition-all truncate ${active ? "bg-blue-50 text-blue-600" : done ? "text-emerald-600 bg-emerald-50" : "text-slate-400"}`}>
                  {done ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" /> : <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                  <span className="truncate">{s.label}</span>
                </div>
                {i < STEPS.length - 1 ? <div className={`w-4 h-px flex-shrink-0 mx-0.5 ${done ? "bg-emerald-300" : "bg-slate-200"}`} /> : null}
              </div>
            );
          })}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          {step === 1 ? (
            <>
              <h2 className="text-base font-semibold text-slate-900">Account & Billing</h2>
              <p className="text-sm text-slate-500">Who is signing up, and how do they want to be billed?</p>
              <div className="grid grid-cols-2 gap-4">
                <input
                  placeholder="Full Name"
                  value={form.contactName}
                  onChange={(e) => setField("contactName", e.target.value)}
                  className={INPUT_CLASS}
                />
                <input
                  type="email"
                  placeholder="Email Address"
                  value={form.contactEmail}
                  onChange={(e) => setField("contactEmail", e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <input
                placeholder="Phone (optional)"
                value={form.contactPhone}
                onChange={(e) => setField("contactPhone", e.target.value)}
                className={INPUT_CLASS}
              />
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Temporary password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Min 8 chars, uppercase, number, symbol"
                    value={form.password}
                    onChange={(e) => setField("password", e.target.value)}
                    className={`${INPUT_CLASS} pr-20`}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      title="Generate a password"
                      onClick={() => setField("password", generatePassword())}
                      className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title={showPassword ? "Hide" : "Show"}
                      onClick={() => setShowPassword((v) => !v)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                {form.password && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= pwStrength.score ? pwStrength.color : "bg-slate-200"}`} />
                      ))}
                    </div>
                    <p className="text-xs text-slate-400">
                      You&apos;ll share this with the hotel owner directly — it&apos;s shown once on the final screen.
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Billing plan</label>
                <select
                  value={form.plan}
                  onChange={(e) => setField("plan", e.target.value as Plan)}
                  className={INPUT_CLASS}
                >
                  {PLAN_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h2 className="text-base font-semibold text-slate-900">Property Identity</h2>
              <p className="text-sm text-slate-500">What staff and guests will see.</p>
              <input
                placeholder="Official Hotel Name"
                value={form.hotelName}
                onChange={(e) => setHotelName(e.target.value)}
                className={INPUT_CLASS}
              />
              <div>
                <div className="flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <input
                    placeholder="subdomain"
                    value={form.subdomain}
                    onChange={(e) => {
                      setSubdomainTouched(true);
                      setField("subdomain", e.target.value);
                    }}
                    className="w-full px-4 py-3 text-sm font-mono outline-none"
                  />
                  <span className="pr-4 text-sm text-slate-400 font-mono whitespace-nowrap">.xyvoo.com</span>
                </div>
                {form.subdomain && finalSubdomain !== form.subdomain.toLowerCase() ? (
                  <p className="text-xs text-slate-400 mt-1">Will be saved as &ldquo;{finalSubdomain}&rdquo;.</p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input
                  placeholder="Room count (optional)"
                  type="number"
                  min="0"
                  value={form.roomCount}
                  onChange={(e) => setField("roomCount", e.target.value)}
                  className={INPUT_CLASS}
                />
                <input
                  placeholder="Property type (optional)"
                  value={form.hotelType}
                  onChange={(e) => setField("hotelType", e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input
                  placeholder="City (optional)"
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                  className={INPUT_CLASS}
                />
                <input
                  placeholder="Country (optional)"
                  value={form.country}
                  onChange={(e) => setField("country", e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <input
                placeholder="Address (optional)"
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
                className={INPUT_CLASS}
              />
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h2 className="text-base font-semibold text-slate-900">Branding</h2>
              <p className="text-sm text-slate-500">
                Logo shown to staff and guests. Full theme colours aren&apos;t configurable yet — the owner can update the
                logo any time from Settings once they&apos;re in.
              </p>
              <input
                placeholder="Logo URL (optional)"
                value={form.logoUrl}
                onChange={(e) => setField("logoUrl", e.target.value)}
                className={INPUT_CLASS}
              />
              {form.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.logoUrl}
                  alt="Logo preview"
                  className="h-16 w-16 rounded-lg border border-slate-200 object-contain bg-white"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
            </>
          ) : null}

          {step === 4 ? (
            <>
              <h2 className="text-base font-semibold text-slate-900">Review & Activate</h2>
              <p className="text-sm text-slate-500">Everything looks good? Activate to provision this hotel system.</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-400">Owner</dt>
                  <dd className="text-slate-800">{form.contactName || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Email</dt>
                  <dd className="text-slate-800">{form.contactEmail || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Plan</dt>
                  <dd className="text-slate-800 capitalize">{form.plan}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Hotel</dt>
                  <dd className="text-slate-800">{form.hotelName || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Subdomain</dt>
                  <dd className="text-slate-800 font-mono">{finalSubdomain || "—"}.xyvoo.com</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Rooms</dt>
                  <dd className="text-slate-800">{form.roomCount || "Not set"}</dd>
                </div>
              </dl>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-slate-600">
                Activation will provision the tenant, create the owner account, and start a 14-day trial. The room setup
                wizard is what the owner sees the first time they log in.
              </div>
              {error ? (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex justify-between mt-6">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || activating}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 bg-white rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          {step < 4 ? (
            <button
              onClick={() => canContinue && setStep((s) => Math.min(4, s + 1))}
              disabled={!canContinue}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => void activate()}
              disabled={activating}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {activating ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {activating ? "Activating…" : "Activate Hotel"}
            </button>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
