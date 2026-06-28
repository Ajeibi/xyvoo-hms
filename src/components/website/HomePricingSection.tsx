"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, X, Zap } from "lucide-react";
import { SectionEyebrow } from "@/components/website/SectionEyebrow";
import { Button } from "@/components/ui/button";
import { HMS_CYCLES, HMS_FEATURES, STORE_FEATURE_COMPARISON_ROWS, STORE_PLANS } from "@/constants/pricing";
import type { HomePricingTab } from "@/types";

type HomePricingSectionProps = {
  /** Fixed header offset + tighter rhythm on `/home/pricing` */
  standalonePage?: boolean;
  /** Which tab is selected on first paint */
  defaultTab?: HomePricingTab;
  /** HMS tier carousel auto-advance (usually off on standalone pricing page) */
  animateHmsCycles?: boolean;
};

export function HomePricingSection({
  standalonePage = false,
  defaultTab = "store",
  animateHmsCycles,
}: HomePricingSectionProps = {}) {
  const shouldAnimateHms = animateHmsCycles ?? !standalonePage;
  const [activeTab, setActiveTab] = useState<HomePricingTab>(defaultTab);
  const [showStoreComparison, setShowStoreComparison] = useState(false);
  const hmsInitialIndex =
    HMS_CYCLES.findIndex((cycle) => cycle.featured) >= 0
      ? HMS_CYCLES.findIndex((cycle) => cycle.featured)
      : HMS_CYCLES.length - 1;
  const [hmsIndex, setHmsIndex] = useState<number>(hmsInitialIndex);
  const [hmsDirection, setHmsDirection] = useState<1 | -1>(-1); // start by moving away from yearly
  const shouldPinTabs = activeTab === "store" && showStoreComparison;

  const selectedHmsCycle =
    HMS_CYCLES[hmsIndex] ?? HMS_CYCLES[HMS_CYCLES.length - 1];
  const formatNaira = (value: string) => value.replace(/^N/, "₦");

  useEffect(() => {
    if (!shouldAnimateHms || activeTab !== "hms") return;

    const interval = window.setInterval(() => {
      setHmsIndex((prev) => {
        const last = HMS_CYCLES.length - 1;
        const dir = hmsDirection;
        let next = prev + dir;

        // Ping-pong: when hitting either end, reverse direction and step inward.
        if (next > last) {
          setHmsDirection(-1);
          next = Math.max(0, last - 1);
        } else if (next < 0) {
          setHmsDirection(1);
          next = Math.min(1, last);
        }

        return next;
      });
    }, 2000);

    return () => window.clearInterval(interval);
  }, [activeTab, hmsDirection, shouldAnimateHms]);

  return (
    <section
      className={standalonePage ? "bg-white pt-28 pb-24" : "py-24"}
      style={{ background: "var(--xyvoo-white)" }}
    >
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mx-auto max-w-[1200px] text-center">
          <SectionEyebrow
            eyebrow="Pricing"
            title="Simple plans that scale with your business"
            titleId="home-pricing-heading"
            titleClassName="text-[clamp(1.625rem,4.4vw,2.75rem)] font-extrabold leading-[1.12]"
            className="[&>h2]:[color:var(--xyvoo-products-navy-alt)] [&>p]:[color:var(--xyvoo-blue)]"
          />
          <p
            className="mx-auto mt-5 max-w-[720px] text-[16px] leading-[1.75]"
            style={{ color: "var(--xyvoo-navy-muted-text)" }}
          >
            Start free, grow at your pace, and move to advanced support only when
            you need it. No hidden lock-ins.
          </p>
        </div>

        <div
          className={`flex justify-center ${
            shouldPinTabs ? "sticky top-[64px] z-30 py-0 mt-0" : "mt-8"
          }`}
          style={
            shouldPinTabs
              ? {
                  background: "var(--xyvoo-white)",
                }
              : undefined
          }
        >
          <div className="inline-flex rounded-2xl border p-1.5" style={{ borderColor: "rgb(var(--xyvoo-blue-rgb) / 0.18)", background: "rgb(var(--xyvoo-blue-rgb) / 0.04)" }}>
            <button
              type="button"
              onClick={() => setActiveTab("store")}
              className="cursor-pointer rounded-xl px-5 py-2.5 text-sm font-semibold transition"
              style={{
                background: activeTab === "store" ? "var(--xyvoo-white)" : "transparent",
                color: "var(--xyvoo-products-navy-alt)",
                boxShadow: activeTab === "store" ? "0 2px 10px rgb(var(--xyvoo-navy-rgb) / 0.08)" : "none",
              }}
            >
              Store Pricing
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("hms")}
              className="cursor-pointer rounded-xl px-5 py-2.5 text-sm font-semibold transition"
              style={{
                background: activeTab === "hms" ? "var(--xyvoo-white)" : "transparent",
                color: "var(--xyvoo-products-navy-alt)",
                boxShadow: activeTab === "hms" ? "0 2px 10px rgb(var(--xyvoo-navy-rgb) / 0.08)" : "none",
              }}
            >
              HMS Pricing
            </button>
          </div>
        </div>

        {activeTab === "store" ? (
          <div className="mt-10">
            {!showStoreComparison ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                {STORE_PLANS.map((plan) => (
                  <article
                    key={plan.name}
                    className="flex h-full flex-col rounded-2xl border p-6"
                    style={{
                      background: plan.featured
                        ? "linear-gradient(145deg, rgb(var(--xyvoo-blue-rgb) / 0.08), rgb(var(--xyvoo-blue-rgb) / 0.03))"
                        : "var(--xyvoo-white)",
                      borderColor: plan.featured
                        ? "rgb(var(--xyvoo-blue-rgb) / 0.28)"
                        : "rgb(var(--xyvoo-blue-rgb) / 0.14)",
                      boxShadow: "0 10px 28px rgb(var(--xyvoo-navy-rgb) / 0.06)",
                    }}
                  >
                    <div className="mb-5">
                      <h3
                        className="text-xl font-extrabold"
                        style={{ color: "var(--xyvoo-products-navy-alt)" }}
                      >
                        {plan.name}
                      </h3>
                      <p
                        className="mt-1 text-sm"
                        style={{ color: "var(--xyvoo-navy-muted-text)" }}
                      >
                        {plan.description}
                      </p>
                    </div>

                    <div className="mb-5">
                      <p
                        className="text-3xl font-extrabold"
                        style={{ color: "var(--xyvoo-products-navy-alt)" }}
                      >
                        {formatNaira(plan.priceDisplay)}
                      </p>
                      <p
                        className="mt-1 text-sm"
                        style={{ color: "var(--xyvoo-navy-muted-text)" }}
                      >
                        {plan.feeDisplay}
                      </p>
                    </div>

                    <ul className="mb-6 flex-1 space-y-2.5">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2.5 text-sm leading-relaxed"
                          style={{
                            color: feature.startsWith("Everything in ")
                              ? "var(--xyvoo-blue)"
                              : "var(--xyvoo-products-navy-alt)",
                            fontWeight: feature.startsWith("Everything in ") ? 700 : 500,
                          }}
                        >
                          <Check
                            className="mt-0.5 h-4 w-4 shrink-0"
                            style={{
                              color: feature.startsWith("Everything in ")
                                ? "var(--xyvoo-blue)"
                                : "var(--xyvoo-blue)",
                            }}
                          />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      asChild
                      variant={plan.featured ? "default" : "outline"}
                      className="w-full"
                    >
                      <Link href={plan.ctaHref}>{plan.ctaLabel}</Link>
                    </Button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-8 rounded-2xl border bg-white p-5 md:p-6" style={{ borderColor: "rgb(var(--xyvoo-blue-rgb) / 0.16)" }}>
                <div className="mb-4 text-center">
                  <h3 className="text-2xl font-bold" style={{ color: "var(--xyvoo-blue)" }}>
                    Feature Comparison
                  </h3>
                  <p className="mt-1 text-sm" style={{ color: "var(--xyvoo-navy-muted-text)" }}>
                    See what&apos;s included in each store plan
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-white border-b">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold" style={{ color: "var(--xyvoo-blue)" }}>Feature</th>
                        <th className="w-20 px-3 py-3 text-center font-semibold" style={{ color: "var(--xyvoo-blue)" }}>Free</th>
                        <th className="w-20 px-3 py-3 text-center font-semibold" style={{ color: "var(--xyvoo-blue)" }}>Standard</th>
                        <th className="w-20 px-3 py-3 text-center font-semibold" style={{ color: "var(--xyvoo-blue)" }}>Enterprise</th>
                      </tr>
                    </thead>
                    <tbody>
                      {STORE_FEATURE_COMPARISON_ROWS.map((row, index) =>
                        "section" in row ? (
                          <tr key={`section-${index}`} style={{ background: "rgb(var(--xyvoo-blue-rgb) / 0.04)" }}>
                            <td colSpan={4} className="px-4 py-2.5 font-semibold" style={{ color: "var(--xyvoo-products-navy-alt)" }}>
                              {row.section}
                            </td>
                          </tr>
                        ) : (
                          <tr key={`${row.feature}-${index}`} className="border-b" style={{ borderColor: "rgb(var(--xyvoo-blue-rgb) / 0.08)" }}>
                            <td className="px-4 py-2.5" style={{ color: "var(--xyvoo-products-navy-alt)" }}>{row.feature}</td>
                            <td className="px-3 py-2.5 text-center">
                              {row.free ? (
                                <Check className="mx-auto h-4 w-4" style={{ color: "var(--xyvoo-blue)" }} />
                              ) : (
                                <X className="mx-auto h-4 w-4" style={{ color: "rgb(var(--xyvoo-navy-rgb) / 0.26)" }} />
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {row.standard ? (
                                <Check className="mx-auto h-4 w-4" style={{ color: "var(--xyvoo-blue)" }} />
                              ) : (
                                <X className="mx-auto h-4 w-4" style={{ color: "rgb(var(--xyvoo-navy-rgb) / 0.26)" }} />
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {row.enterprise ? (
                                <Check className="mx-auto h-4 w-4" style={{ color: "var(--xyvoo-blue)" }} />
                              ) : (
                                <X className="mx-auto h-4 w-4" style={{ color: "rgb(var(--xyvoo-navy-rgb) / 0.26)" }} />
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-10">
            <div
              key={selectedHmsCycle.id}
              className="relative mb-8 overflow-hidden rounded-3xl p-10 text-white shadow-2xl"
              style={{ background: "var(--xyvoo-hms-pricing-hero-gradient)" }}
            >
              <div
                className="absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl"
                style={{ background: "var(--xyvoo-hms-pricing-hero-glow-a)" }}
              />
              <div
                className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full blur-3xl"
                style={{ background: "var(--xyvoo-hms-pricing-hero-glow-b)" }}
              />

              <div className="relative grid items-center gap-10 md:grid-cols-2">
                <div>
                  {selectedHmsCycle.badge && (
                    <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/20 px-3 py-1.5 text-xs font-bold text-amber-300">
                      <Zap className="h-3 w-3" /> {selectedHmsCycle.badge}
                    </div>
                  )}
                  <div className="mb-2 flex items-end gap-2">
                    <span className="text-6xl font-black">
                      {formatNaira(selectedHmsCycle.priceDisplay)}
                    </span>
                    <span className="pb-2 text-lg" style={{ color: "var(--xyvoo-hms-pricing-hero-accent)" }}>
                      {selectedHmsCycle.period}
                    </span>
                  </div>
                  <p className="mb-1 text-sm" style={{ color: "var(--xyvoo-hms-pricing-hero-accent)" }}>
                    {selectedHmsCycle.feeDisplay}
                  </p>
                  <p className="text-xs" style={{ color: "var(--xyvoo-hms-pricing-hero-accent-soft)" }}>
                    Effective rate: {selectedHmsCycle.total ? formatNaira(selectedHmsCycle.total) : ""}
                  </p>
                  <div className="mt-8 flex flex-col gap-3">
                    <Link
                      href="/register"
                      className="flex items-center justify-center gap-2 rounded-xl px-8 py-4 text-base font-bold shadow-lg transition-opacity hover:opacity-90"
                      style={{
                        background: "var(--xyvoo-blue)",
                        color: "var(--xyvoo-white)",
                      }}
                    >
                      {selectedHmsCycle.ctaLabel} <ArrowRight className="h-4 w-4" />
                    </Link>
                    <p className="text-center text-xs" style={{ color: "var(--xyvoo-hms-pricing-hero-accent-soft)" }}>
                      No credit card required
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {HMS_FEATURES.slice(0, 9).map((feature) => (
                    <div
                      key={feature}
                      className="flex items-center gap-2.5 text-sm"
                      style={{ color: "var(--xyvoo-feature-card-navy-title)" }}
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--xyvoo-blue)" }} />{" "}
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8">
              <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-slate-400">
                All Features Included
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {HMS_FEATURES.map((feature) => (
                  <div
                    key={feature}
                    className="flex items-center gap-2.5 text-sm text-slate-700"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--xyvoo-blue)" }} />{" "}
                    {feature}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "store" && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => setShowStoreComparison((prev) => !prev)}
              className="cursor-pointer text-sm font-semibold"
              style={{ color: "var(--xyvoo-blue)" }}
            >
              {showStoreComparison
                ? "Hide full pricing comparison"
                : "View full pricing comparison"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
