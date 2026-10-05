import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Launching soon",
  description: "Sign-in and registration for XYVOO HMS and Storefront open soon.",
  robots: { index: false, follow: true },
};

export default function ComingSoonPage() {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-24 text-center">
      <span className="rounded-full bg-xyvoo-blue/10 px-3 py-1 text-sm font-semibold text-xyvoo-blue">Launching soon</span>
      <h1 className="mt-5 text-h2 font-bold tracking-tight text-foreground">We&apos;re almost ready for you</h1>
      <p className="mt-4 text-p leading-relaxed text-muted-foreground">
        Sign-in and registration for XYVOO HMS and Storefront aren&apos;t open yet. If you&apos;d like early access or a
        walkthrough, get in touch and we&apos;ll let you know as soon as they are.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/contact"
          className="inline-flex items-center justify-center rounded-lg bg-xyvoo-blue px-6 py-3 text-[14.5px] font-semibold text-white transition-colors hover:bg-xyvoo-blue/90"
        >
          Contact us
        </Link>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-[14.5px] font-semibold text-foreground transition-colors hover:bg-muted/80"
        >
          Back to home
        </Link>
      </div>
    </section>
  );
}
