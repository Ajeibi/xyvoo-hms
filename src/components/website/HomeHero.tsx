"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { XYVOO_AUTH_ROUTES } from "@/constants/auth-links";

const HOME_HERO_BG =
  "/images/background%20images/xyvoo.png" as const;

/** Intrinsic ratio for layout; image still scales with `w-full h-auto` (no crop). */
const HERO_IMAGE_WIDTH = 2400;
const HERO_IMAGE_HEIGHT = 1600;

const heroGridStyle: CSSProperties = {
  backgroundImage: `
      linear-gradient(to right, rgba(0, 13, 31, 0.05) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(0, 13, 31, 0.05) 1px, transparent 1px)
    `,
  backgroundSize: "40px 40px",
};

export function HomeHero() {
  return (
    <section
      className="relative isolate w-full bg-white pb-0 pt-28"
      style={heroGridStyle}
    >
      <div className="relative z-10 w-full pb-4 pt-2">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
          >
            <h1 className="mb-5 text-balance text-4xl font-black leading-[1.08] tracking-tight text-foreground md:text-5xl lg:text-[2.75rem] lg:leading-[1.12]">
             Your business deserves its own system — not scattered tools
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
            Run your hotel or online store from one system — simple, powerful, and built for real operations.
            </p>
            <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:justify-center">
              <Button
                variant="default"
                size="xl"
                className="w-full sm:w-auto"
                asChild
              >
                <Link href={XYVOO_AUTH_ROUTES.hms.register}>
                Launch your HMS
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover/button:translate-x-0.5" data-icon="inline-end" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="xl"
                className="w-full border-2 sm:w-auto"
                asChild
              >
                <Link href={XYVOO_AUTH_ROUTES.store.register}>Start your online store</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="relative z-0 lg:-mt-[150px]">
        <Image
          src={HOME_HERO_BG}
          alt="Diverse team collaborating with smartphones"
          width={HERO_IMAGE_WIDTH}
          height={HERO_IMAGE_HEIGHT}
          priority
          sizes="(max-width: 768px) 100vw, 2000px"
          className="relative z-0 block h-auto w-full min-w-0 max-w-none"
          style={{ width: "100%", height: "auto" }}
        />
      </div>
    </section>
  );
}
