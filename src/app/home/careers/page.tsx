"use client";

import { useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { ArrowRight, MapPin, Clock, ChevronDown } from "lucide-react";

const fadeUp: Variants = {
  offscreen: { opacity: 0, y: 40 },
  onscreen: { opacity: 1, y: 0, transition: { duration: 0.7, bounce: 0.2 } },
};

const JOBS = [
  { title: "Senior Backend Engineer", dept: "Engineering", location: "Lagos (Hybrid)", type: "Full-time", desc: "Build the core infrastructure that powers hotel operations across Africa. Node.js, Deno, PostgreSQL." },
  { title: "Product Designer (UI/UX)", dept: "Design", location: "Lagos or Remote", type: "Full-time", desc: "Design beautiful, intuitive interfaces for hotel staff who use our platform every day." },
  { title: "Customer Success Manager", dept: "Customer Success", location: "Abuja", type: "Full-time", desc: "Work directly with hotels to ensure their onboarding is smooth and their team is thriving on XYVOO." },
  { title: "Sales Executive — East Africa", dept: "Sales", location: "Nairobi", type: "Full-time", desc: "Lead sales efforts across Kenya, Tanzania, Uganda and Rwanda. Hotel industry experience preferred." },
  { title: "Technical Support Specialist", dept: "Support", location: "Remote (Africa)", type: "Full-time", desc: "Be the frontline expert helping hotel staff get the most out of XYVOO via WhatsApp, email and phone." },
  { title: "Marketing Manager — Content", dept: "Marketing", location: "Lagos or Remote", type: "Full-time", desc: "Own XYVOO's content strategy — blog, social, email. Deep knowledge of hospitality a bonus." },
  { title: "DevOps Engineer", dept: "Engineering", location: "Remote", type: "Full-time", desc: "Maintain and scale our cloud infrastructure to support 500+ hotels with 99.9% uptime." },
];

const PERKS = [
  { icon: "💰", title: "Competitive Pay", desc: "Top-of-market salary in local currency, benchmarked quarterly" },
  { icon: "🌍", title: "Work from Africa", desc: "Lagos, Nairobi, Accra or fully remote — your choice" },
  { icon: "📈", title: "Equity Options", desc: "Share in XYVOO's growth with meaningful employee equity" },
  { icon: "🏥", title: "Health Insurance", desc: "Full medical, dental & vision for you and your dependants" },
  { icon: "📚", title: "Learning Budget", desc: "₦600k/year for courses, books, and conferences" },
  { icon: "⏱️", title: "Flexible Hours", desc: "Async-first culture. We care about results, not hours logged" },
];

const DEPTS = ["All", "Engineering", "Design", "Customer Success", "Sales", "Support", "Marketing"];

export default function CareersPage() {
  const [dept, setDept] = useState("All");
  const [expanded, setExpanded] = useState<number | null>(null);
  const filtered = dept === "All" ? JOBS : JOBS.filter((j) => j.dept === dept);

  return (
    <WebsiteLayout>
      <section className="pt-32 pb-24 bg-slate-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(rgba(99,102,241,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.5) 1px,transparent 1px)", backgroundSize: "60px 60px" }} />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">Careers at XYVOO</p>
            <h1 className="text-5xl md:text-6xl font-black leading-tight mb-6">
              Build something that<br />
              <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">matters.</span>
            </h1>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-8">
              We&apos;re a team of builders, hoteliers, and problem-solvers. If you want to change how African hotels work, you&apos;re in the right place.
            </p>
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-5 py-2 text-sm text-indigo-200">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              {JOBS.length} open positions · Remote-friendly
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} className="text-center mb-14">
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">Why XYVOO</p>
            <h2 className="text-4xl font-black text-slate-900">We take care of our people.</h2>
          </motion.div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
            {PERKS.map(({ icon, title, desc }) => (
              <motion.div key={title} initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}
                className="bg-slate-50 border border-slate-100 rounded-3xl p-7 hover:shadow-lg transition-all">
                <div className="text-3xl mb-4">{icon}</div>
                <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-500">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} className="text-center mb-10">
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">Open Positions</p>
            <h2 className="text-4xl font-black text-slate-900">Find your role.</h2>
          </motion.div>

          <div className="flex gap-2 flex-wrap justify-center mb-8">
            {DEPTS.map((d) => (
              <button
                key={d}
                onClick={() => setDept(d)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  dept === d ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-300"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filtered.map((job, i) => (
              <motion.div key={job.title} initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <button onClick={() => setExpanded(expanded === i ? null : i)}
                  className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-slate-50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold text-slate-900">{job.title}</h3>
                      <span className="text-xs bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full font-semibold">{job.dept}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{job.location}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{job.type}</span>
                    </div>
                  </div>
                  <motion.div animate={{ rotate: expanded === i ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {expanded === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} style={{ overflow: "hidden" }}>
                      <div className="px-6 pb-6">
                        <p className="text-sm text-slate-600 mb-4">{job.desc}</p>
                        <a href={`mailto:careers@xyvoo.com?subject=Application: ${job.title}`}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
                          Apply for this role <ArrowRight className="w-4 h-4" />
                        </a>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>

          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}
            className="mt-10 bg-indigo-50 border border-indigo-100 rounded-2xl p-6 text-center">
            <p className="text-sm font-semibold text-slate-800 mb-1">Don&apos;t see a perfect fit?</p>
            <p className="text-sm text-slate-500 mb-4">We&apos;re always interested in exceptional people. Send us your CV.</p>
            <a href="mailto:careers@xyvoo.com"
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-indigo-300 text-indigo-700 text-sm font-semibold rounded-xl hover:bg-indigo-100 transition-colors">
              careers@xyvoo.com
            </a>
          </motion.div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
