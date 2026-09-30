"use client";

import { useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Mail, MessageCircle, Send, CheckCircle2, ArrowUpRight, Calendar } from "lucide-react";
import type { MarketingContactForm } from "@/types";
import { GridPulses } from "@/components/website/GridPulses";

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

// TODO: replace with the real Calendly booking link.
const CALENDLY_URL = "#";

const CONTACT_METHODS: ContactMethod[] = [
  {
    title: "Request a demo",
    description: "A short walkthrough of XYVOO HMS or Storefront, tailored to what you're running.",
    actionLabel: "Book a time",
    href: CALENDLY_URL,
    external: true,
  },
  {
    title: "Email us",
    description: "Prefer to write? Outline your situation and someone from the team will reply.",
    actionLabel: "hello@getxyvoo.com",
    href: "mailto:hello@getxyvoo.com",
  },
];

const SALES_BUSINESS_TYPES = ["XYVOO HMS", "XYVOO Storefront", "Not sure yet"];
const SUPPORT_URGENCY_LEVELS = ["Low — general question", "Medium — affecting some work", "High — affecting the whole team", "Urgent — business-critical"];

export default function ContactPage() {
  const [form, setForm] = useState<MarketingContactForm>({ name: "", email: "", company: "", message: "", type: "sales" });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof MarketingContactForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    setSubmitted(true);
  };

  const inputCls = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all";

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
              The first conversation costs nothing. Tell us whether you&apos;re running a hotel or a storefront, and we&apos;ll take it from there.
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

      <section id="contact-form" className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-start">
          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}>
            <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
              {submitted ? (
                <div className="text-center py-12">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                  </motion.div>
                  <h3 className="text-h3 font-black text-slate-900 mb-2">Message sent!</h3>
                  <p className="text-slate-500 text-sm">We&apos;ll get back to you within 2 hours. Check your email.</p>
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
                    <div className="grid grid-cols-2 gap-4">
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
                        <div className="grid grid-cols-2 gap-4">
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
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label htmlFor="contact-company" className="block text-xs font-medium text-slate-600 mb-1.5">Hotel / Storefront Name *</label>
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
            <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}>
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-xyvoo-blue/10">
                  <Calendar className="h-6 w-6 text-xyvoo-blue" />
                </div>
                <h3 className="text-h3 font-black text-slate-900 mb-2">Request a demo</h3>
                <p className="text-p text-slate-500 mb-6 leading-relaxed">
                  A short walkthrough of XYVOO HMS or Storefront, tailored to what you&apos;re running — pick a time that works for you.
                </p>
                <a
                  href={CALENDLY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-xyvoo-blue py-3.5 font-bold text-white transition-all hover:opacity-90"
                >
                  Book a time <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
            </motion.div>

            <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                {[
                  { icon: MessageCircle, label: "WhatsApp", val: "Fastest support", color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
                  { icon: Mail, label: "Email", val: "hello@getxyvoo.com", color: "bg-indigo-50 text-indigo-600 border-indigo-100" },
                  // TODO: replace with the real LinkedIn company page link. Lucide has no
                  // brand icons, so this uses the same plain-text glyph the footer's
                  // social row already uses instead of importing one.
                  { glyph: "in", label: "LinkedIn", val: "Follow us", color: "bg-sky-50 text-sky-600 border-sky-100", href: "#" },
                ].map(({ icon: Icon, glyph, label, val, color, href }) => {
                  const content = (
                    <>
                      {Icon ? (
                        <Icon className="w-6 h-6 shrink-0 sm:mb-3" />
                      ) : (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center text-base font-bold sm:mb-3">{glyph}</span>
                      )}
                      <div className="min-w-0">
                        <p className="font-bold text-sm">{label}</p>
                        <p className="text-xs opacity-70 mt-1 break-words">{val}</p>
                      </div>
                    </>
                  );
                  return href ? (
                    <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={`flex min-w-0 items-center gap-4 border rounded-2xl p-5 transition-opacity hover:opacity-80 sm:block ${color}`}>
                      {content}
                    </a>
                  ) : (
                    <div key={label} className={`flex min-w-0 items-center gap-4 border rounded-2xl p-5 sm:block ${color}`}>
                      {content}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </>
  );
}
