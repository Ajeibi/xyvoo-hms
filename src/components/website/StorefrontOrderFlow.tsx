"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

export type StorefrontOrderFlowStep = {
  id: string;
  title: string;
  description: string;
  explanation: string;
};

function StepCard({ step, index, accentRgb }: { step: StorefrontOrderFlowStep; index: number; accentRgb: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6, boxShadow: "0 20px 45px rgba(4,20,15,0.12)" }}
      className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
      style={{ transition: "box-shadow 0.3s ease" }}
    >
      <motion.span
        whileHover={{ scale: 1.12 }}
        transition={{ type: "spring", stiffness: 400, damping: 12 }}
        className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ background: `rgb(${accentRgb})` }}
      >
        {index + 1}
      </motion.span>
      <h5 className="text-h5 font-bold text-xyvoo-navy">{step.title}</h5>
      <p className="mt-2 text-p leading-relaxed text-xyvoo-navy/70">{step.description}</p>
      <p className="mt-5 border-t border-slate-100 pt-4 text-sm leading-relaxed text-xyvoo-navy/45">{step.explanation}</p>
    </motion.div>
  );
}

/** A plain row of onboarding-step cards — built for Storefront pages
 * specifically so they read differently from HMS's autoplay slider, just
 * without any extra decorative shape on top (no ticket notches, no
 * connecting path) since three items doesn't need one. */
export function StorefrontOrderFlow({
  headingId,
  heading,
  steps,
  accentRgb,
}: {
  headingId: string;
  heading: string;
  steps: StorefrontOrderFlowStep[];
  accentRgb: string;
}) {
  const headingRef = useRef<HTMLDivElement>(null);
  const headingInView = useInView(headingRef, { once: true, margin: "-60px" });

  return (
    <section className="bg-slate-50 px-6 py-16 md:py-24" aria-labelledby={headingId}>
      <div className="mx-auto max-w-[1100px]">
        <div ref={headingRef} className="mb-14 text-center md:mb-16">
          <motion.h3
            id={headingId}
            initial={{ opacity: 0, y: 16 }}
            animate={headingInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.55 }}
            className="text-h3 font-black text-xyvoo-navy"
          >
            {heading}
          </motion.h3>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {steps.map((step, i) => (
            <StepCard key={step.id} step={step} index={i} accentRgb={accentRgb} />
          ))}
        </div>
      </div>
    </section>
  );
}
