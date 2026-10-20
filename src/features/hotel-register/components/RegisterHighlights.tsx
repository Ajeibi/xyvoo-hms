"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";

type Highlight = { eyebrow: string; title: string; body: string; points: string[] };

/** One panel per register step, in the same order as the form's steps. */
const HIGHLIGHTS: Highlight[] = [
  {
    eyebrow: "Your hotel, your brand",
    title: "Your hotel gets its own home on XYVOO.",
    body: "The web address you pick becomes where your team signs in every day. Guests see your hotel's name on what they receive.",
    points: [
      "Your own address at your-hotel.getxyvoo.com",
      "Your name and contact details on receipts, invoices and booking pages",
      "Front desk, housekeeping, F&B and billing set up under one account",
    ],
  },
  {
    eyebrow: "One connected system",
    title: "Every department works from the same live data.",
    body: "No more re-keying between the desk, housekeeping and the restaurant. A change in one place shows up everywhere it matters.",
    points: [
      "Room status (clean, dirty, occupied, out of order) the moment it changes",
      "Check guests in and assign a room on one screen, walk-ins included",
      "Restaurant and bar orders go straight from table to kitchen",
    ],
  },
  {
    eyebrow: "Your team, your rules",
    title: "Give every member of staff the right access.",
    body: "You're the owner of this account. Once you're in, add your team and decide what each role can see and do.",
    points: [
      "Roles and access set by you in Staff & access",
      "Each person signs in with their own login",
      "Voids and refunds need a manager's sign-off, so nothing slips through",
    ],
  },
  {
    eyebrow: "Simple pricing",
    title: "Every feature, on every billing cycle.",
    body: "Pick monthly or a longer cycle. Either way you get the whole system, and you try it free before you pay anything.",
    points: [
      "14 days free, no card needed to start",
      "Save up to 17% by paying quarterly or yearly",
      "Branded receipts and invoices with your local taxes handled",
    ],
  },
];

/** Right-hand panel on hotel registration: points about XYVOO HMS that change with the register step. */
export default function RegisterHighlights({ step }: { step: number }) {
  const index = Math.min(Math.max(step, 0), HIGHLIGHTS.length - 1);
  const item = HIGHLIGHTS[index];

  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden border-l border-slate-200 bg-white px-12 xl:px-20">
      {/* Watermark: the XYVOO shield, oversized and faint, bleeding off the bottom-right corner. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -right-24 -bottom-24 h-[38rem] w-[38rem] rounded-full bg-sky-100/60 blur-3xl" />
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-blue-50 blur-3xl" />
        <div className="absolute -right-16 top-1/2 h-[36rem] w-[36rem] -translate-y-1/2 xl:h-[44rem] xl:w-[44rem]">
          <motion.div
            className="relative h-full w-full"
            initial={{ opacity: 0, rotate: -14, scale: 0.94 }}
            animate={{ opacity: 1, rotate: -8 + index * 2, scale: 1 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          >
            <Image src="/images/XYVOO%20Shield.png" alt="" fill className="object-contain opacity-[0.2]" sizes="44rem" />
          </motion.div>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-xl">
        <div className="relative">
          <span
            className="pointer-events-none absolute -left-8 -top-16 select-none font-serif text-[10rem] leading-none text-xyvoo-blue/15"
            aria-hidden
          >
            &ldquo;
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="relative"
            >
              <p className="mb-5 text-sm font-bold uppercase tracking-[0.2em] text-xyvoo-blue-deep">{item.eyebrow}</p>
              <h2 className="text-4xl font-bold leading-[1.15] text-black xl:text-5xl">{item.title}</h2>
              <p className="mt-6 text-xl leading-relaxed text-slate-600">{item.body}</p>
              <ul className="mt-8 space-y-4 rounded-2xl border border-slate-200/80 bg-white/60 p-6 shadow-[0_20px_50px_-24px_rgba(15,60,140,0.25)] backdrop-blur-sm">
                {item.points.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-lg leading-snug text-black">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-xyvoo-blue/10 text-xyvoo-blue-deep">
                      <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-12 flex items-center gap-2" aria-hidden>
          {HIGHLIGHTS.map((h, i) => (
            <span
              key={h.eyebrow}
              className={`h-1.5 rounded-full transition-all duration-500 ${i === index ? "w-10 bg-xyvoo-blue" : "w-4 bg-slate-200"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
