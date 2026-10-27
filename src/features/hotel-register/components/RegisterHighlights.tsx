"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Quote } from "lucide-react";

/** One quote per register step, in the same order as the form's steps. */
const REGISTER_QUOTES = [
  "Your hotel's name on everything guests see, and one address where your whole team signs in.",
  "The front desk, housekeeping and the kitchen finally see the same thing at the same time.",
  "Everyone gets their own login, and sees only what their job needs.",
  "Every feature, free for 14 days. No card, no catch.",
];

/**
 * Right-hand panel on hotel registration and sign-in: a short quote. On registration it changes with the step;
 * pass `quotes` for a page with its own (sign-in has one).
 */
export default function RegisterHighlights({ step = 0, quotes = REGISTER_QUOTES }: { step?: number; quotes?: string[] }) {
  const index = Math.min(Math.max(step, 0), quotes.length - 1);

  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden border-l border-slate-200 bg-white px-10 xl:px-16">
      {/* Watermark: the XYVOO shield, oversized and faint, bleeding off the right edge. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -right-24 -bottom-24 h-[38rem] w-[38rem] rounded-full bg-sky-100/60 blur-3xl" />
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-blue-50 blur-3xl" />
        <div className="absolute -right-16 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 xl:h-[34rem] xl:w-[34rem]">
          <motion.div
            className="relative h-full w-full"
            initial={{ opacity: 0, rotate: -14, scale: 0.94 }}
            animate={{ opacity: 1, rotate: -8 + index * 2, scale: 1 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          >
            <Image src="/images/XYVOO%20Shield.png" alt="" fill className="object-contain opacity-[0.2]" sizes="34rem" />
          </motion.div>
        </div>
      </div>

      {/* Opening quote mark tucked into the panel's top-left corner. */}
      <Quote
        className="pointer-events-none absolute left-1 top-1 h-[10.2rem] w-[10.2rem] rotate-180 text-xyvoo-blue/25 xl:h-[12.75rem] xl:w-[12.75rem]"
        fill="currentColor"
        strokeWidth={0}
        aria-hidden
      />

      <figure className="relative mx-auto w-full max-w-md">
        <AnimatePresence mode="wait" initial={false}>
          <motion.blockquote
            key={index}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="relative text-2xl font-semibold leading-snug text-slate-900 xl:text-3xl"
          >
            {quotes[index]}
          </motion.blockquote>
        </AnimatePresence>
      </figure>
    </div>
  );
}
