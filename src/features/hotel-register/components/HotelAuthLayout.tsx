"use client";

import Image from "next/image";
import { MotionConfig } from "framer-motion";
import WebsiteLayout from "@/components/website/WebsiteLayout";

const RECEPTION_IMAGE = "/images/background%20images/receptionBg.png";

/**
 * Split layout shared by hotel sign-in and registration, matching the storefront's:
 * the receptionist photo sits on a soft blue panel, sticky on desktop and faded behind the card on phones.
 * Pass `aside` to swap the desktop photo for that panel, shown to the right of the form.
 */
export default function HotelAuthLayout({
  imageAlt,
  aside,
  children,
}: {
  imageAlt: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const sidePanel = "relative hidden h-[calc(100vh-76px)] overflow-hidden lg:sticky lg:top-[76px] lg:block";

  return (
    <WebsiteLayout>
      <MotionConfig reducedMotion="user">
        {/* The form renders once so its ids stay unique; only the image treatment changes by breakpoint. */}
        <div className="relative w-full overflow-hidden bg-white pt-[76px] pb-16 lg:grid lg:grid-cols-2 lg:overflow-visible lg:pb-0">
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-b from-sky-50 via-blue-50 to-white lg:hidden"
            aria-hidden
          >
            <Image src={RECEPTION_IMAGE} alt="" fill className="object-contain object-bottom opacity-20" sizes="100vw" />
          </div>

          {aside ? (
            <div className={`${sidePanel} lg:order-2`}>{aside}</div>
          ) : (
            <div className={`${sidePanel} bg-gradient-to-br from-sky-50 via-blue-50 to-white`}>
              <Image src={RECEPTION_IMAGE} alt={imageAlt} fill className="object-contain object-bottom" sizes="50vw" preload />
            </div>
          )}

          <div className="relative z-10 flex items-center justify-center p-4 sm:p-6 lg:items-stretch lg:p-12">
            <div className="w-full max-w-sm space-y-6 rounded-2xl border border-slate-100/80 bg-white/95 p-6 shadow-xl backdrop-blur-md sm:max-w-md sm:p-8 lg:max-w-md lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:pb-20 lg:shadow-none lg:backdrop-blur-none">
              {children}
            </div>
          </div>
        </div>
      </MotionConfig>
    </WebsiteLayout>
  );
}
