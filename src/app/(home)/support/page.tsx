"use client";

import { useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { MessageCircle, Mail, Phone, BookOpen, ChevronDown, Search, ArrowRight, Clock } from "lucide-react";

const fadeUp: Variants = {
  offscreen: { opacity: 0, y: 40 },
  onscreen: { opacity: 1, y: 0, transition: { duration: 0.7, bounce: 0.2 } },
};

const FAQS = [
  { q: "How do I add a new room to my property?", a: "Go to Rooms in the left sidebar, click 'Add Room', fill in the room details including room number, type, floor, and rate, then save. The room is immediately available for reservations." },
  { q: "Can I import existing guest data from a spreadsheet?", a: "Yes. Our onboarding team can migrate your existing guest data as part of your setup. Alternatively, you can import a CSV file from the Guests section — contact support for the template." },
  { q: "What happens if I lose internet connection?", a: "XYVOO is a PWA (Progressive Web App). Critical functions like viewing current reservations and room status continue working offline. Changes sync automatically when you reconnect." },
  { q: "How do I set up different PIN codes for each department?", a: "In your Setup Wizard, go to Step 5 (Staff). Enable each department you use and set a unique PIN. Staff use these PINs to access their department's station from any shared device." },
  { q: "Can I process refunds through XYVOO?", a: "Yes. Open the relevant reservation, go to the Payments tab, and select 'Record Refund'. If payment was made via Paystack, the refund is processed automatically." },
  { q: "How do I reset a staff member's access?", a: "Go to Settings > Staff Management, find the staff member, and use the 'Reset Access' option. You can also update their department assignment and PIN from there." },
  { q: "Is my data backed up?", a: "Yes, automatically. XYVOO runs daily encrypted backups. In the event of data loss, we can restore to any point within the past 30 days." },
];

const CHANNELS = [
  { icon: MessageCircle, label: "WhatsApp Support", desc: "Fastest response. Available 24/7.", action: "Chat on WhatsApp", color: "bg-emerald-50 border-emerald-100 text-emerald-700" },
  {
    icon: Mail,
    label: "Email Support",
    desc: "Detailed help for complex issues.",
    action: "support@xyvoo.com",
    style: {
      background: "var(--xyvoo-blue-subtle-bg-05)",
      borderColor: "var(--xyvoo-blue-border-soft)",
      color: "var(--xyvoo-blue)",
    },
  },
  {
    icon: Phone,
    label: "Phone Support",
    desc: "Mon–Fri, 8am–6pm WAT.",
    action: "+234 800 XYVOO 1",
    style: {
      background: "var(--xyvoo-navy-subtle-bg)",
      borderColor: "var(--xyvoo-navy-border-soft)",
      color: "var(--xyvoo-navy)",
    },
  },
  { icon: BookOpen, label: "Help Center", desc: "Step-by-step guides and tutorials.", action: "Browse Articles", color: "bg-amber-50 border-amber-100 text-amber-700" },
];

export default function SupportPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const filtered = FAQS.filter((f) => f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <section className="pt-32 pb-16 bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-xyvoo-blue">
              Support Center
            </p>
            <h1 className="mb-6 text-5xl font-black leading-tight text-xyvoo-navy md:text-6xl">
              How can we help?
            </h1>
            <p className="text-xl text-slate-500 mb-8">Real humans. Real answers. Usually within minutes.</p>
            <div className="relative max-w-lg mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input placeholder="Search FAQs..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-2xl text-slate-900 text-sm outline-none border border-slate-200 bg-slate-50 focus:ring-4 transition-all" />
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CHANNELS.map(({ icon: Icon, label, desc, action, color, style: cardStyle }) => (
              <motion.div key={label} initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}
                className={`border rounded-2xl p-6 hover:shadow-md transition-all cursor-pointer ${color || ""}`}
                style={cardStyle || {}}>
                <Icon className="w-8 h-8 mb-4 opacity-80" />
                <h3 className="font-bold mb-1">{label}</h3>
                <p className="text-xs opacity-70 mb-3">{desc}</p>
                <p className="text-xs font-semibold flex items-center gap-1">{action} <ArrowRight className="w-3 h-3" /></p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-4 bg-slate-50 border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap gap-6 items-center justify-center">
          {[["WhatsApp", "< 5 minutes"], ["Email", "< 2 hours"], ["Phone", "Immediate"]].map(([ch, rt]) => (
            <div key={ch} className="flex items-center gap-2 text-sm text-slate-600">
              <Clock className="h-4 w-4 text-xyvoo-blue" />
              <span className="font-medium">{ch}:</span>
              <span className="text-emerald-600 font-bold">{rt}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} className="text-center mb-14">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-xyvoo-blue">FAQ</p>
            <h2 className="text-4xl font-black text-slate-900">Common questions.</h2>
          </motion.div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="mb-2">No results for &quot;{search}&quot;</p>
              <p className="text-sm">Try different keywords or contact us directly.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(({ q, a }, i) => (
                <motion.div key={i} initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}
                  className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-slate-50 transition-colors">
                    <span className="font-semibold text-slate-900 text-sm pr-4">{q}</span>
                    <motion.div animate={{ rotate: openFaq === i ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex-shrink-0">
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {openFaq === i && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} style={{ overflow: "hidden" }}>
                        <div className="px-6 pb-5 text-sm text-slate-500 leading-relaxed border-t border-slate-100 pt-4">{a}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-xyvoo-navy py-20 text-center">
        <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} className="max-w-xl mx-auto px-6">
          <h2 className="text-3xl font-black text-white mb-3">Still need help?</h2>
          <p className="text-slate-400 mb-8">Our support team is standing by. We typically respond in under 5 minutes on WhatsApp.</p>
          <a href="https://wa.me/2348001234567" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl bg-xyvoo-blue px-8 py-4 text-base font-bold text-white transition-all hover:opacity-90"
          >
            <MessageCircle className="w-5 h-5" /> Chat on WhatsApp
          </a>
        </motion.div>
      </section>
    </>
  );
}
