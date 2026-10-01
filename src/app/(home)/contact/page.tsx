"use client";

import { useEffect, useRef, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Send, CheckCircle2, ArrowRight, ArrowUpRight, Calendar, RotateCcw, Copy, Check, Mail, X } from "lucide-react";
import type { IconType } from "react-icons";
import { FaEnvelope, FaLinkedinIn, FaWhatsapp, FaYahoo } from "react-icons/fa6";
import { PiMicrosoftOutlookLogo } from "react-icons/pi";
import { SiGmail } from "react-icons/si";
import type { MarketingContactForm } from "@/types";
import { GridPulses } from "@/components/website/GridPulses";
import { DEMO_BOOKING_ANCHOR, DEMO_BOOKING_URL } from "@/constants/booking";

const fadeUp: Variants = {
  offscreen: { opacity: 0, y: 40 },
  onscreen: { opacity: 1, y: 0, transition: { duration: 0.7, bounce: 0.2 } },
};

type ContactMethod = {
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  external?: boolean;
};

// TODO: add the WhatsApp Business number (international format, digits only), e.g. https://wa.me/2348000000000
const WHATSAPP_URL = "https://wa.me/";
// TODO: replace with the real LinkedIn company page link.
const LINKEDIN_URL = "#";

const SALES_EMAIL = "hello@getxyvoo.com";
const SUPPORT_EMAIL = "support@getxyvoo.com";

/** Compose links for the common webmail providers, so visitors can write from whichever inbox they use. */
const EMAIL_APPS: Array<{ label: string; icon: IconType; color: string; href: (to: string) => string }> = [
  { label: "Gmail", icon: SiGmail, color: "#EA4335", href: (to) => `https://mail.google.com/mail/?view=cm&fs=1&to=${to}` },
  { label: "Outlook", icon: PiMicrosoftOutlookLogo, color: "#0078D4", href: (to) => `https://outlook.live.com/mail/0/deeplink/compose?to=${to}` },
  { label: "Yahoo", icon: FaYahoo, color: "#6001D2", href: (to) => `https://compose.mail.yahoo.com/?to=${to}` },
  { label: "Mail app", icon: FaEnvelope, color: "#475569", href: (to) => `mailto:${to}` },
];

const CONTACT_METHODS: ContactMethod[] = [
  {
    title: "Request a demo",
    description: "A short walkthrough of XYVOO HMS or Storefront, tailored to what you're running.",
    actionLabel: "Book a time",
    href: `#${DEMO_BOOKING_ANCHOR}`,
  },
  {
    title: "Email us",
    description: "Prefer to write? Outline your situation and someone from the team will reply.",
    actionLabel: SALES_EMAIL,
    href: `mailto:${SALES_EMAIL}`,
  },
];

const SALES_BUSINESS_TYPES = ["XYVOO HMS", "XYVOO Storefront", "Not sure yet"];
const SUPPORT_URGENCY_LEVELS = ["Low — general question", "Medium — affecting some work", "High — affecting the whole team", "Urgent — business-critical"];

export default function ContactPage() {
  const [form, setForm] = useState<MarketingContactForm>({ name: "", email: "", company: "", message: "", type: "sales" });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inbox = form.type === "support" ? SUPPORT_EMAIL : SALES_EMAIL;
  // Honeypot: hidden from real visitors, so anything typed here is a bot.
  const [website, setWebsite] = useState("");
  // The Zoho booking calendar is only fetched once someone shows intent (hover, focus, touch or
  // click on "Book a time"), and stays hidden behind a loading button until it is ready.
  // Zoho's iframe "load" fires ~2s or more before its calendar is drawn and it sends no ready message we
  // can read cross-origin, so "ready" is load plus a settle delay. Links to #book-a-demo open it.
  const [frameRequested, setFrameRequested] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [wantsBooking, setWantsBooking] = useState(false);
  const booking: "closed" | "loading" | "open" = !wantsBooking ? "closed" : frameReady ? "open" : "loading";
  const prefetchBooking = () => setFrameRequested(true);
  const startBooking = () => {
    setFrameRequested(true);
    setWantsBooking(true);
  };
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleFrameLoad = () => {
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setFrameReady(true), 3000);
  };
  useEffect(() => () => clearTimeout(settleTimer.current), []);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === `#${DEMO_BOOKING_ANCHOR}`) startBooking();
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  // If Zoho is slow or blocked, show the frame anyway so the "open in a new tab" fallback is reachable.
  useEffect(() => {
    if (booking !== "loading") return;
    const timer = setTimeout(() => setFrameReady(true), 15000);
    return () => clearTimeout(timer);
  }, [booking]);

  // The opened calendar sits below the form, so bring it into view and move focus off the vanished button.
  const bookingRef = useRef<HTMLDivElement>(null);
  const bookingHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (booking !== "open") return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bookingHeadingRef.current?.focus({ preventScroll: true });
    bookingRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [booking]);

  const set = (k: keyof MarketingContactForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, website }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; reference?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "We couldn't send your message. Please try again or email us directly.");
        return;
      }
      setReference(data?.reference ?? null);
      setSubmitted(true);
    } catch {
      setError("We couldn't send your message. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // Keep who they are, clear what they said, so a second message is quick to write.
  const sendAnother = () => {
    setForm((f) => ({ ...f, message: "", businessType: "", urgency: "" }));
    setReference(null);
    setError(null);
    setSubmitted(false);
  };

  const copyInbox = async () => {
    try {
      await navigator.clipboard.writeText(inbox);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context): the address is still visible to copy by hand.
    }
  };

  const inputCls ="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all";

  return (
    <>
      <section
        className="relative isolate overflow-hidden bg-white px-6 pt-36 pb-20 md:pb-24 border-b border-slate-100"
        style={{
          // Same grid-line texture as the Company tab of the home hero.
          backgroundImage:
            "linear-gradient(to right, rgba(7, 22, 44, 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(7, 22, 44, 0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      >
        <GridPulses color="#90caf9" />
        <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-1 gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: "easeOut" }}>
            <p className="mb-5 text-eyebrow font-bold uppercase tracking-[0.22em] text-xyvoo-blue">
              Get In Touch
            </p>
            <h1 className="text-balance text-h1 font-black leading-[1.08] tracking-tight text-xyvoo-navy">
              Tell us about your <span className="text-xyvoo-blue">business</span>.
            </h1>
            <p className="mt-6 max-w-md text-p leading-relaxed text-slate-500">
              The first conversation costs nothing. Tell us whether you&apos;re running a hotel or an online store, and we&apos;ll take it from there.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1, ease: "easeOut" }}
            className="border-t border-slate-200"
          >
            {CONTACT_METHODS.map((method) => (
              <a
                key={method.title}
                href={method.href}
                target={method.external ? "_blank" : undefined}
                rel={method.external ? "noopener noreferrer" : undefined}
                className="group block border-b border-slate-200 py-7 first:pt-0"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-lg font-bold text-xyvoo-navy">{method.title}</h3>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold uppercase tracking-wider text-xyvoo-blue transition-colors group-hover:text-xyvoo-navy">
                    {method.actionLabel}
                    <ArrowUpRight className="h-3 w-3" />
                  </span>
                </div>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{method.description}</p>
              </a>
            ))}
          </motion.div>
        </div>
      </section>

      <section id="contact-form" className="py-20 px-6 bg-slate-50">
        <div className="relative max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}>
            <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
              {submitted ? (
                <div className="text-center py-12">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                  </motion.div>
                  <h3 className="text-h3 font-black text-slate-900 mb-2">Message sent!</h3>
                  <p className="text-slate-500 text-sm">We&apos;ll get back to you within 2 hours. Check your email.</p>
                  {reference && (
                    <p className="mt-3 text-xs text-slate-400">
                      Your reference: <span className="font-mono font-semibold text-slate-600">{reference}</span>
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={sendAnother}
                    className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-xyvoo-navy transition-colors hover:border-xyvoo-blue hover:text-xyvoo-blue"
                  >
                    <RotateCcw className="h-4 w-4" /> Send another message
                  </button>
                </div>
              ) : (
                <>
                  <h3 className="text-h3 font-black text-slate-900 mb-6">Send us a message</h3>

                  <div className="grid grid-cols-2 gap-2 mb-6">
                    {[["sales", "Talk to Sales"], ["support", "Get Support"]].map(([val, label]) => (
                      <button key={val} onClick={() => set("type", val)}
                        className={`py-2.5 px-3 rounded-xl text-xs font-semibold border-2 transition-all ${form.type === val ? "" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
                        style={
                          form.type === val
                            ? {
                                borderColor: "var(--xyvoo-blue)",
                                background: "var(--xyvoo-blue-subtle-bg)",
                                color: "var(--xyvoo-blue)",
                              }
                            : {}
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="contact-name" className="block text-xs font-medium text-slate-600 mb-1.5">Full Name *</label>
                        <input id="contact-name" name="name" autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Amara Okafor" required className={inputCls} />
                      </div>
                      <div>
                        <label htmlFor="contact-email" className="block text-xs font-medium text-slate-600 mb-1.5">Email *</label>
                        <input id="contact-email" name="email" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="amara@hotel.com" required className={inputCls} />
                      </div>
                    </div>

                    {form.type === "sales" ? (
                      <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label htmlFor="contact-company" className="block text-xs font-medium text-slate-600 mb-1.5">Hotel / Company</label>
                            <input id="contact-company" name="company" autoComplete="organization" value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Grand Meridian Hotel" className={inputCls} />
                          </div>
                          <div>
                            <label htmlFor="contact-business-type" className="block text-xs font-medium text-slate-600 mb-1.5">What are you running?</label>
                            <select id="contact-business-type" name="businessType" value={form.businessType ?? ""} onChange={(e) => set("businessType", e.target.value)} className={inputCls}>
                              <option value="">Select one</option>
                              {SALES_BUSINESS_TYPES.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label htmlFor="contact-message" className="block text-xs font-medium text-slate-600 mb-1.5">Tell us what you need *</label>
                          <textarea id="contact-message" name="message" value={form.message} onChange={(e) => set("message", e.target.value)} rows={5} required placeholder="What are you looking for, and how many properties or locations are you running?" className={`${inputCls} resize-none`} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label htmlFor="contact-company" className="block text-xs font-medium text-slate-600 mb-1.5">Hotel / Store name *</label>
                            <input id="contact-company" name="company" autoComplete="organization" value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Grand Meridian Hotel" required className={inputCls} />
                          </div>
                          <div>
                            <label htmlFor="contact-urgency" className="block text-xs font-medium text-slate-600 mb-1.5">Urgency</label>
                            <select id="contact-urgency" name="urgency" value={form.urgency ?? ""} onChange={(e) => set("urgency", e.target.value)} className={inputCls}>
                              <option value="">Select one</option>
                              {SUPPORT_URGENCY_LEVELS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label htmlFor="contact-message" className="block text-xs font-medium text-slate-600 mb-1.5">Describe the issue *</label>
                          <textarea id="contact-message" name="message" value={form.message} onChange={(e) => set("message", e.target.value)} rows={5} required placeholder="What's going wrong, and when did it start?" className={`${inputCls} resize-none`} />
                        </div>
                      </>
                    )}

                    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                      <label htmlFor="contact-website">Website</label>
                      <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                    </div>

                    {error && (
                      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-xyvoo-blue py-3.5 font-bold text-white transition-all hover:opacity-90 disabled:opacity-60"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <><Send className="w-4 h-4" /> Send Message</>
                      )}
                    </button>
                  </form>
                </>
              )}
            </div>
          </motion.div>

          <div className="space-y-6">
            {booking !== "open" && (
              <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}>
                <div id={DEMO_BOOKING_ANCHOR} className="scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-xyvoo-blue/10">
                    <Calendar className="h-6 w-6 text-xyvoo-blue" />
                  </div>
                  <h3 className="text-h3 font-black text-slate-900 mb-2">Request a demo</h3>
                  <p className="text-p text-slate-500 mb-6 leading-relaxed">
                    A short walkthrough of XYVOO HMS or Storefront, tailored to what you&apos;re running — pick a time that works for you.
                  </p>
                  <button
                    type="button"
                    onClick={startBooking}
                    onPointerEnter={prefetchBooking}
                    onFocus={prefetchBooking}
                    onTouchStart={prefetchBooking}
                    disabled={booking === "loading"}
                    aria-busy={booking === "loading"}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-xyvoo-blue py-3.5 font-bold text-white transition-all hover:opacity-90 disabled:cursor-wait disabled:opacity-80"
                  >
                    {booking === "loading" ? (
                      <>
                        <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-hidden="true" />
                        Loading calendar…
                      </>
                    ) : (
                      <>
                        Book a time <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                    <Mail className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold text-xyvoo-navy">Email us from any inbox</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500">
                      Gmail, Outlook, Yahoo or any other email works. Pick yours to start a message.
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <a href={`mailto:${inbox}`} className="min-w-0 truncate font-semibold text-xyvoo-navy hover:text-xyvoo-blue">
                    {inbox}
                  </a>
                  <button
                    type="button"
                    onClick={copyInbox}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:bg-white hover:text-xyvoo-blue"
                    aria-label={`Copy ${inbox}`}
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {EMAIL_APPS.map(({ label, icon: Icon, color, href }) => (
                    <a
                      key={label}
                      href={href(inbox)}
                      target={href(inbox).startsWith("mailto:") ? undefined : "_blank"}
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                      <Icon className="h-4 w-4 shrink-0" style={{ color }} aria-hidden="true" />
                      {label}
                    </a>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  {form.type === "support" ? "Support requests" : "Sales questions"} go to {inbox}. Choose Sales or Support on the form to change it.
                </p>
              </div>
            </motion.div>

            <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                {[
                  { icon: FaWhatsapp, label: "WhatsApp", val: "Fastest support", href: WHATSAPP_URL, color: "bg-emerald-50 text-[#128C4B] border-emerald-100" },
                  { icon: FaLinkedinIn, label: "LinkedIn", val: "Follow us", href: LINKEDIN_URL, color: "bg-sky-50 text-[#0A66C2] border-sky-100" },
                ].map(({ icon: Icon, label, val, href, color }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex min-w-0 items-center gap-4 rounded-2xl border p-5 transition-opacity hover:opacity-80 ${color}`}
                  >
                    <Icon className="h-7 w-7 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{label}</p>
                      <p className="mt-0.5 text-xs opacity-80">{val}</p>
                    </div>
                  </a>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Full width so Zoho has room for its month view (it switches to a day list below 1024px). */}
          {frameRequested && (
            <div
              ref={bookingRef}
              id={booking === "open" ? DEMO_BOOKING_ANCHOR : undefined}
              aria-hidden={booking !== "open"}
              inert={booking !== "open"}
              className={
                booking === "open"
                  ? "scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2"
                  : // While loading, keep the frame in the viewport but transparent: Chrome pauses rendering of
                    // hidden or off-screen cross-origin iframes, so Zoho would not draw until revealed. Only the
                    // classes change on reveal (never the DOM position), so the iframe does not reload.
                    "pointer-events-none fixed inset-x-0 top-0 -z-10 opacity-0"
              }
            >
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-xyvoo-blue/10">
                    <Calendar className="h-6 w-6 text-xyvoo-blue" />
                  </div>
                  <div>
                    <h3 ref={bookingHeadingRef} tabIndex={-1} className="text-h3 font-black text-slate-900 focus:outline-none">
                      Request a demo
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500">
                      Pick a date, then choose a time that works for you.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWantsBooking(false)}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-xyvoo-navy"
                >
                  <X className="h-4 w-4" aria-hidden="true" /> Hide calendar
                </button>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <iframe
                  src={DEMO_BOOKING_URL}
                  title="Choose a time for your XYVOO demo"
                  onLoad={handleFrameLoad}
                  className="block h-[760px] w-full border-0"
                />
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Calendar not loading?{" "}
                <a
                  href={DEMO_BOOKING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-xyvoo-blue hover:text-xyvoo-navy"
                >
                  Open it in a new tab<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
