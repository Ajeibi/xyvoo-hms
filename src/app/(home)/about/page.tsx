"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { ArrowRight, Target, Heart, Zap, Globe } from "lucide-react";

const fadeUp: Variants = {
  offscreen: { opacity: 0, y: 40 },
  onscreen: { opacity: 1, y: 0, transition: { type: "spring", duration: 0.8, bounce: 0.2 } },
};

const VALUES = [
  { icon: Target, title: "Focused Simplicity", desc: "We remove complexity from hotel operations. Every feature we build must make a hotelier's day simpler, not harder." },
  { icon: Heart, title: "Customer Obsession", desc: "We're not just a software vendor. We're a long-term partner in your hotel's growth. Your success is our metric." },
  { icon: Zap, title: "Speed & Reliability", desc: "We build for uptime and performance. When your hotel is busy, XYVOO needs to be rock solid." },
  { icon: Globe, title: "Africa-first", desc: "We're proud to be building world-class hospitality software rooted in the African experience and designed for local realities." },
];

const MILESTONES = [
  { year: "2021", title: "The Idea", desc: "XYVOO was born from frustration — watching great hotels run on Excel sheets and WhatsApp groups." },
  { year: "2022", title: "First Build", desc: "A small team of 3 engineers and 1 designer built the first version in 6 months, tested by 5 Lagos hotels." },
  { year: "2023", title: "Market Launch", desc: "We opened to the public and onboarded 50 hotels across Nigeria in the first 3 months." },
  { year: "2024", title: "Pan-Africa", desc: "Expanded to Ghana, Kenya and Rwanda. Raised seed funding to accelerate product development." },
  { year: "2025", title: "500 Hotels", desc: "Crossed 500 active properties. Launched multi-department station model and Paystack integration." },
  { year: "2026", title: "Today", desc: "Serving hotels in 8 African countries with a team of 40 people across Lagos, Nairobi and London." },
];

export default function AboutPage() {
  return (
    <WebsiteLayout>
      <section className="pt-32 pb-16 bg-white border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-xyvoo-blue">
              Our Story
            </p>
            <h1 className="mb-6 text-5xl font-black leading-tight text-xyvoo-navy md:text-6xl">
              We&apos;re building the future<br />
              <span
                style={{
                  background: "var(--xyvoo-gradient-text)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                of African hospitality.
              </span>
            </h1>
            <p className="text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
              XYVOO was founded by hoteliers, for hoteliers. We got tired of watching great hotels struggle with outdated tools. So we built something better.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-xyvoo-blue">
              Our Mission
            </p>
            <h2 className="mb-6 text-4xl font-black text-xyvoo-navy">
              To make every independent hotel as efficient as a global chain.
            </h2>
            <p className="text-slate-500 leading-relaxed mb-4">
              Global hotel chains have million-dollar technology budgets. Independent African hotels deserve the same quality — without the enterprise price tag or complexity.
            </p>
            <p className="text-slate-500 leading-relaxed mb-8">
              XYVOO levels the playing field. From a 10-room guesthouse in Ibadan to a 200-room resort in Accra, every property deserves world-class management tools.
            </p>
            <Link
              href="/team"
              className="inline-flex items-center gap-2 font-semibold text-xyvoo-blue transition-all hover:gap-3"
            >
              Meet our team <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}
            className="grid grid-cols-2 gap-4">
            {[["500+", "Hotels"], ["8", "Countries"], ["40+", "Team Members"], ["99.9%", "Uptime"]].map(([v, l]) => (
              <div key={l} className="bg-slate-50 border border-slate-100 rounded-3xl p-8 text-center hover:shadow-md transition-shadow">
                <p className="mb-2 text-4xl font-black text-xyvoo-blue">{v}</p>
                <p className="text-sm text-slate-500 font-medium">{l}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} className="text-center mb-14">
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">What We Stand For</p>
            <h2 className="text-4xl font-black text-slate-900">Our values.</h2>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-6">
            {VALUES.map(({ icon: Icon, title, desc }) => (
              <motion.div key={title} initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}
                className="bg-white border border-slate-100 rounded-3xl p-8 hover:shadow-lg transition-all group">
                <div
                  className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl transition-colors"
                  style={{ background: "var(--xyvoo-blue-subtle-bg-08)" }}
                >
                  <Icon className="h-6 w-6 text-xyvoo-blue" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} className="text-center mb-16">
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">Our Journey</p>
            <h2 className="text-4xl font-black text-slate-900">The XYVOO story.</h2>
          </motion.div>
          <div className="relative">
            <div className="absolute left-16 top-0 bottom-0 w-px bg-slate-200" />
            <div className="space-y-10">
              {MILESTONES.map(({ year, title, desc }) => (
                <motion.div key={year} initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp}
                  className="flex gap-8 items-start">
                  <div className="w-32 flex-shrink-0 text-right">
                    <span
                      className="rounded-full px-3 py-1 text-sm font-black text-xyvoo-blue"
                      style={{ background: "var(--xyvoo-blue-subtle-bg-08)" }}
                    >
                      {year}
                    </span>
                  </div>
                  <div className="relative pt-1">
                    <div className="absolute top-1.5 -left-[25px] h-3 w-3 rounded-full bg-xyvoo-blue ring-4" />
                    <h3 className="font-bold text-slate-900 mb-1">{title}</h3>
                    <p className="text-sm text-slate-500">{desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-xyvoo-blue py-24 text-center">
        <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} className="max-w-2xl mx-auto px-6">
          <h2 className="text-4xl font-black text-white mb-4">Be part of the story.</h2>
          <p className="mb-8" style={{ color: "var(--xyvoo-white-muted-75)" }}>
            Join 500+ hotels that chose XYVOO to power their operations.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-black text-xyvoo-blue shadow-lg transition-all hover:bg-blue-50"
          >
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </section>
    </WebsiteLayout>
  );
}
