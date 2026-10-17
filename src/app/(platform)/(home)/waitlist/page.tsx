import type { Metadata } from "next";
import { BellRing, FlaskConical, ShieldCheck } from "lucide-react";
import { GridPulses } from "@/components/website/GridPulses";
import WaitlistForm from "@/components/website/WaitlistForm";
import { parseWaitlistProduct, waitlistProductName } from "@/lib/marketing/waitlist-products";

export const metadata: Metadata = {
  title: "Join the waitlist",
  description: "XYVOO HMS and Storefront are in alpha testing. Join the waitlist and we'll email you when a place opens.",
  robots: { index: false, follow: true },
};

const WHAT_HAPPENS = [
  {
    icon: FlaskConical,
    title: "We're opening up in stages",
    text: "We're starting with a small group of businesses, so we can get every detail right before everyone joins.",
  },
  {
    icon: BellRing,
    title: "We'll email you when a place opens",
    text: "You'll get a confirmation now, then another email when it's your turn, with everything you need to get started.",
  },
  {
    icon: ShieldCheck,
    title: "Your email is only for this",
    text: "We'll only use it to contact you about your place on the waitlist.",
  },
] as const;

/** Where sign-in and registration send people while they're locked for alpha testing. */
export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ product?: string | string[] }> }) {
  const product = parseWaitlistProduct((await searchParams).product);

  return (
    <section
      className="relative isolate overflow-hidden border-b border-slate-100 bg-white px-4 pt-32 pb-20 sm:px-6 md:pt-36 md:pb-28"
      style={{
        // Same grid-line texture as the home hero and the contact page.
        backgroundImage:
          "linear-gradient(to right, rgba(7, 22, 44, 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(7, 22, 44, 0.04) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    >
      <GridPulses color="#90caf9" />
      {/* On phones the form follows the intro; from lg it sits beside both. */}
      <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-x-16 lg:gap-y-10">
        <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-xyvoo-blue/20 bg-white/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-xyvoo-blue-deep">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-xyvoo-blue/60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-xyvoo-blue" />
            </span>
            Alpha testing
          </p>
          <h1 className="text-balance text-[2.25rem] font-black leading-[1.08] tracking-tight text-xyvoo-navy sm:text-h1">
            Be first in line for <span className="text-xyvoo-blue">{waitlistProductName(product)}</span>.
          </h1>
          <p className="mt-6 max-w-lg text-p leading-relaxed text-slate-600">
            {`We're testing ${product ? waitlistProductName(product) : "XYVOO HMS and Storefront"} with a small group of businesses before we open to everyone, so sign-in and registration aren't open yet. Join the waitlist and we'll let you know as soon as a place opens.`}
          </p>
        </div>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
          <WaitlistForm initialProduct={product} />
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <h2 className="sr-only">What happens next</h2>
          <ul className="grid gap-6" role="list">
            {WHAT_HAPPENS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-xyvoo-blue/10 text-xyvoo-blue">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-bold text-xyvoo-navy">{title}</span>
                  <span className="mt-1 block max-w-md text-sm leading-relaxed text-slate-600">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
