"use client";

import { useState } from "react";
import { motion, type Variants } from "framer-motion";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { Mail, MapPin, MessageCircle, Send, CheckCircle2 } from "lucide-react";
import type { MarketingContactForm } from "@/types";

const fadeUp: Variants = {
  offscreen: { opacity: 0, y: 40 },
  onscreen: { opacity: 1, y: 0, transition: { duration: 0.7, bounce: 0.2 } },
};

const OFFICES = [
  { city: "Lagos", addr: "14 Adeola Odeku Street, Victoria Island, Lagos 101241", phone: "+234 800 998 6661", email: "lagos@xyvoo.com" },
  { city: "Nairobi", addr: "The Prism, Upper Hill Towers, Upper Hill, Nairobi 00100", phone: "+254 700 998 661", email: "nairobi@xyvoo.com" },
  { city: "London", addr: "1 Canada Square, Canary Wharf, London E14 5AB", phone: "+44 20 7946 0998", email: "london@xyvoo.com" },
];

export default function ContactPage() {
  const [form, setForm] = useState<MarketingContactForm>({ name: "", email: "", company: "", message: "", type: "demo" });
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
    <WebsiteLayout>
      <section className="pt-32 pb-20 bg-white border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-xyvoo-blue">
              Get In Touch
            </p>
            <h1 className="text-5xl md:text-6xl font-black leading-tight text-slate-900 mb-6">Let&apos;s talk.</h1>
            <p className="text-xl text-slate-500 max-w-xl mx-auto">
              Whether you want a product demo, have a question, or just want to say hello — we&apos;d love to hear from you.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-start">
          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}>
            <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
              {submitted ? (
                <div className="text-center py-12">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                  </motion.div>
                  <h3 className="text-2xl font-black text-slate-900 mb-2">Message sent!</h3>
                  <p className="text-slate-500 text-sm">We&apos;ll get back to you within 2 hours. Check your email.</p>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-black text-slate-900 mb-6">Send us a message</h2>

                  <div className="grid grid-cols-3 gap-2 mb-6">
                    {[["demo", "Request Demo"], ["sales", "Talk to Sales"], ["support", "Get Support"]].map(([val, label]) => (
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
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Full Name *</label>
                        <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Amara Okafor" required className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Email *</label>
                        <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="amara@hotel.com" required className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Hotel / Company</label>
                      <input value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Grand Meridian Hotel" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Message *</label>
                      <textarea value={form.message} onChange={(e) => set("message", e.target.value)} rows={5} required placeholder="Tell us what you're looking for..." className={`${inputCls} resize-none`} />
                    </div>
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
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: MessageCircle, label: "WhatsApp", val: "Fastest support", color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
                  { icon: Mail, label: "Email", val: "hello@xyvoo.com", color: "bg-indigo-50 text-indigo-600 border-indigo-100" },
                ].map(({ icon: Icon, label, val, color }) => (
                  <div key={label} className={`border rounded-2xl p-5 ${color}`}>
                    <Icon className="w-6 h-6 mb-3" />
                    <p className="font-bold text-sm">{label}</p>
                    <p className="text-xs opacity-70 mt-1">{val}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {OFFICES.map((office) => (
              <motion.div key={office.city} initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}
                className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="font-black text-slate-900 mb-1">{office.city}</p>
                    <p className="text-xs text-slate-500 mb-3 leading-relaxed">{office.addr}</p>
                    <p className="text-xs text-indigo-600 font-medium">{office.phone}</p>
                    <p className="text-xs text-indigo-600 font-medium">{office.email}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
