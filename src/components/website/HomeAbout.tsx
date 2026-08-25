"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HomeAbout() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  return (
    <section
      ref={containerRef}
      className="w-full bg-white py-16 lg:py-24"
      aria-labelledby="about-section-title"
    >
      <div className="mx-auto max-w-7xl px-6 md:px-12">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
          
          {/* Left Column: Image (40% width on desktop) */}
          <motion.div
            className="w-full lg:w-[40%]"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="relative overflow-hidden rounded-2xl border border-slate-100 shadow-[0_16px_36px_rgba(0,13,31,0.06)]">
              <Image
                src="/images/Home%20Page/xyvoo-about.png"
                alt="XYVOO team and platform preview"
                width={1536}
                height={1024}
                className="w-full h-auto"
                priority
              />
            </div>
          </motion.div>

          {/* Right Column: Text Content (60% width on desktop) */}
          <motion.div
            className="w-full lg:w-[60%]"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          >
            <div className="flex flex-col">
              
              {/* Headline */}
              <h3 id="about-section-title" className="mb-6 text-balance text-3xl font-black leading-[1.14] tracking-tight text-xyvoo-navy sm:text-4xl">
                About XYVOO
              </h3>

              {/* Body Paragraph */}
              <p className="mb-8 text-base leading-relaxed text-slate-600 sm:text-[16.5px]">
                There&apos;s no shortage of software for hotels and retailers. What&apos;s
                harder to find is a system that&apos;s genuinely yours — with no XYVOO
                branding in sight — built specifically for the business you actually
                run. Our Hotel Management System and Storefront are two separate,
                independent platforms, each built for the business it actually serves
                — not one system stretched to cover both. That&apos;s what we built.
              </p>

              {/* CTA Link */}
              <div>
                <Button variant="default" size="xl" asChild className="rounded-xl">
                  <Link href="/about" className="flex items-center gap-2 font-bold">
                    <span>Read our full story</span>
                    <ArrowRight className="h-4.5 w-4.5 transition-transform duration-150 group-hover/button:translate-x-1" />
                  </Link>
                </Button>
              </div>

            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
