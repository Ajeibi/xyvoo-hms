"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowRight, Check, Loader2, Mail } from "lucide-react";
import { WAITLIST_CHOICES, waitlistProductName, type WaitlistProduct } from "@/lib/marketing/waitlist-products";
import { cn } from "@/lib/utils";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The waitlist card: which product, an email address, then a confirmation in its place. */
export default function WaitlistForm({ initialProduct }: { initialProduct: WaitlistProduct | null }) {
  const [product, setProduct] = useState<WaitlistProduct | null>(initialProduct);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState<{ email: string; product: WaitlistProduct | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fail = (message: string) => {
    setError(message);
    inputRef.current?.focus();
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const typed = email.trim();
    if (!typed) return fail("Enter your email address.");
    if (!EMAIL_PATTERN.test(typed)) return fail("Enter an email address in the format name@example.com.");

    setSubmitting(true);
    setError("");
    try {
      const website = String(new FormData(event.currentTarget).get("website") ?? "");
      const res = await fetch("/api/public/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: typed, product, website: website || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return fail(typeof data.error === "string" ? data.error : "We couldn't add you to the waitlist. Please try again.");
      setJoined({ email: typed, product });
    } catch {
      fail("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative">
        {/* Soft brand glow behind the card. */}
        <div
          className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] opacity-70 blur-2xl"
          style={{ background: "radial-gradient(60% 60% at 70% 20%, rgb(var(--xyvoo-blue-rgb) / 0.18), transparent 70%), radial-gradient(50% 50% at 20% 90%, rgb(var(--xyvoo-mint-rgb) / 0.22), transparent 70%)" }}
          aria-hidden
        />
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_64px_-24px_rgb(var(--xyvoo-navy-rgb)/0.28)]">
          <div className="h-1.5 bg-gradient-to-r from-xyvoo-blue to-[rgb(var(--xyvoo-mint-rgb))]" aria-hidden />
          <AnimatePresence mode="wait" initial={false}>
            {joined ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="px-6 py-10 text-center sm:px-10 sm:py-12"
              >
                <motion.span
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", bounce: 0.5, delay: 0.1 }}
                  className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60"
                  aria-hidden
                >
                  <Check className="size-8 text-emerald-600" strokeWidth={3} />
                </motion.span>
                {/* Focused as it appears (after the form's exit animation), so screen-reader users hear it. */}
                <h2 ref={(el) => el?.focus()} tabIndex={-1} className="mt-6 text-2xl font-black tracking-tight text-xyvoo-navy outline-none">
                  You&apos;re on the waitlist
                </h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
                  {`Your place for ${waitlistProductName(joined.product)} is saved. As soon as it's your turn, we'll email:`}
                </p>
                <p className="mx-auto mt-3 inline-block max-w-full rounded-full bg-xyvoo-blue/10 px-4 py-1.5 text-sm font-semibold text-xyvoo-navy [overflow-wrap:anywhere]">
                  {joined.email}
                </p>
                <div className="mx-auto mt-6 flex max-w-sm items-start gap-3 rounded-2xl bg-slate-50 p-4 text-left text-sm leading-relaxed text-slate-600">
                  <Mail className="mt-0.5 size-4 shrink-0 text-xyvoo-blue" aria-hidden />
                  <span>Look out for a confirmation email. If you can&apos;t see it in a few minutes, check your spam or promotions folder.</span>
                </div>
                <Link
                  href="/"
                  className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 text-[14.5px] font-semibold text-xyvoo-navy transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2"
                >
                  Back to home
                </Link>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                onSubmit={submit}
                noValidate
                aria-labelledby="waitlist-title"
                className="px-6 py-8 sm:px-10 sm:py-10"
              >
                <h2 id="waitlist-title" className="text-2xl font-black tracking-tight text-xyvoo-navy">
                  Join the waitlist
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">It takes a few seconds. We&apos;ll email you a confirmation.</p>

                <fieldset className="mt-7">
                  <legend className="text-sm font-semibold text-xyvoo-navy">
                    What are you interested in? <span className="font-normal text-slate-500">(optional)</span>
                  </legend>
                  <div className="mt-3 grid gap-2.5">
                    {WAITLIST_CHOICES.map((choice) => {
                      const checked = product === choice.value;
                      return (
                        <label
                          key={choice.value}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-xyvoo-blue has-[:focus-visible]:ring-offset-1",
                            checked ? "border-xyvoo-blue bg-xyvoo-blue/[0.06]" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                          )}
                        >
                          <input
                            type="radio"
                            name="product"
                            value={choice.value}
                            checked={checked}
                            onChange={() => setProduct(choice.value)}
                            className="sr-only"
                          />
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                              checked ? "border-xyvoo-blue bg-xyvoo-blue" : "border-slate-300 bg-white",
                            )}
                            aria-hidden
                          >
                            {checked ? <span className="size-2 rounded-full bg-white" /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-xyvoo-navy">{choice.label}</span>
                            <span className="block text-xs leading-snug text-slate-600">{choice.hint}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <label htmlFor="waitlist-email" className="mt-6 block text-sm font-semibold text-xyvoo-navy">
                  Email address
                </label>
                <input
                  ref={inputRef}
                  id="waitlist-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  placeholder="you@yourbusiness.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "waitlist-error" : "waitlist-hint"}
                  className={cn(
                    "mt-2 min-h-12 w-full rounded-xl border bg-white px-4 text-base text-xyvoo-navy placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-1",
                    error ? "border-red-600" : "border-slate-300",
                  )}
                />
                <p id="waitlist-error" role="alert" className="mt-2 text-sm font-medium text-red-700 empty:hidden">
                  {error}
                </p>
                <p id="waitlist-hint" className="mt-2 text-xs text-slate-500">
                  Only used for your place on the waitlist.
                </p>

                {/* Honeypot: hidden from people and assistive tech; bots that fill it are ignored. */}
                <div className="hidden" aria-hidden="true">
                  <label htmlFor="waitlist-website">Website</label>
                  <input id="waitlist-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  aria-disabled={submitting || undefined}
                  className="group mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-xyvoo-blue-deep px-6 text-[15px] font-semibold text-white shadow-sm transition-all hover:bg-[#0d47a1] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-80"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Joining…
                    </>
                  ) : (
                    <>
                      Join the waitlist
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </>
                  )}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  );
}
