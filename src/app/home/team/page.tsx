"use client";

import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { Share2, Globe2, ArrowRight } from "lucide-react";
import type { MarketingTeamAvatarProps } from "@/types";

const fadeUp: Variants = {
  offscreen: { opacity: 0, y: 40 },
  onscreen: { opacity: 1, y: 0, transition: { type: "spring", duration: 0.8, bounce: 0.2 } },
};

const LEADERSHIP = [
  { name: "Taiwo Adeyemi", role: "CEO & Co-founder", bio: "Former GM at Transcorp Hilton. Built and sold two hotel tech startups. 15 years in African hospitality.", initials: "TA", hue: 231 },
  { name: "Ngozi Obi", role: "CTO & Co-founder", bio: "Ex-Andela engineer. Led engineering at Flutterwave. Obsessed with building software that just works.", initials: "NO", hue: 260 },
  { name: "Kwame Asante", role: "Chief Product Officer", bio: "Product leader who built Paystack's merchant dashboard and Piggyvest's savings features.", initials: "KA", hue: 180 },
  { name: "Amina Suleiman", role: "VP of Customer Success", bio: "Ex-Marriott operations director. Trained over 2,000 hotel staff across West and East Africa.", initials: "AS", hue: 340 },
];

const TEAM = [
  { name: "Emeka Okonkwo", role: "Lead Engineer", initials: "EO", hue: 50 },
  { name: "Fatima Balogun", role: "Head of Design", initials: "FB", hue: 310 },
  { name: "David Mensah", role: "Sales Director, West Africa", initials: "DM", hue: 150 },
  { name: "Aisha Kamara", role: "Head of Support", initials: "AK", hue: 20 },
  { name: "Oluwaseun Ojo", role: "Backend Engineer", initials: "OO", hue: 200 },
  { name: "Grace Mwangi", role: "East Africa Lead", initials: "GM", hue: 100 },
  { name: "Ibrahim Diallo", role: "Mobile Engineer", initials: "ID", hue: 270 },
  { name: "Chidinma Eze", role: "Marketing Manager", initials: "CE", hue: 0 },
];

function Avatar({ initials, hue, size = "lg" }: MarketingTeamAvatarProps) {
  const sz = size === "lg" ? "w-24 h-24 text-2xl" : "w-16 h-16 text-base";
  return (
    <div className={`${sz} rounded-3xl flex items-center justify-center font-black text-white shadow-lg`}
      style={{ background: `linear-gradient(135deg, hsl(${hue},70%,55%), hsl(${hue + 30},70%,45%))` }}>
      {initials}
    </div>
  );
}

export default function TeamPage() {
  return (
    <WebsiteLayout>
      <section className="pt-32 pb-16 bg-white border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-xyvoo-blue">
              Our Team
            </p>
            <h1 className="mb-6 text-5xl font-black leading-tight text-xyvoo-navy md:text-6xl">
              The people behind<br />
              <span
                style={{
                  background: "var(--xyvoo-gradient-text)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                every great feature.
              </span>
            </h1>
            <p className="text-xl text-slate-500 max-w-xl mx-auto">
              A diverse team of hoteliers, engineers, and designers united by one mission — to modernise African hospitality.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} className="text-center mb-14">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-xyvoo-blue">
              Leadership
            </p>
            <h2 className="text-4xl font-black text-slate-900">The founding team.</h2>
          </motion.div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {LEADERSHIP.map(({ name, role, bio, initials, hue }) => (
              <motion.div key={name} initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}
                className="bg-slate-50 border border-slate-100 rounded-3xl p-7 text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="flex justify-center mb-5">
                  <Avatar initials={initials} hue={hue} size="lg" />
                </div>
                <h3 className="font-black text-slate-900 mb-0.5">{name}</h3>
                <p className="mb-3 text-xs font-semibold text-xyvoo-blue">{role}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{bio}</p>
                <div className="flex justify-center gap-3 mt-4">
                  <button className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 transition-colors hover:bg-xyvoo-blue hover:text-white">
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  <button className="w-7 h-7 bg-slate-200 rounded-lg flex items-center justify-center hover:bg-sky-500 hover:text-white transition-colors">
                    <Globe2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} className="text-center mb-14">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-xyvoo-blue">
              The Team
            </p>
            <h2 className="text-4xl font-black text-slate-900">40 people. One mission.</h2>
          </motion.div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {TEAM.map(({ name, role, initials, hue }) => (
              <motion.div key={name} initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}
                className="bg-white border border-slate-100 rounded-2xl p-5 text-center hover:shadow-md transition-all">
                <div className="flex justify-center mb-4">
                  <Avatar initials={initials} hue={hue} size="sm" />
                </div>
                <p className="font-bold text-slate-900 text-sm">{name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{role}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-xyvoo-blue py-24 text-center">
        <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} className="max-w-2xl mx-auto px-6">
          <h2 className="text-4xl font-black text-white mb-4">Want to join us?</h2>
          <p className="mb-8" style={{ color: "var(--xyvoo-white-muted-75)" }}>
            We&apos;re always looking for exceptional people who care about African tech.
          </p>
          <Link
            href="/home/careers"
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-black text-xyvoo-blue transition-all hover:bg-blue-50"
          >
            View Open Roles <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </section>
    </WebsiteLayout>
  );
}
