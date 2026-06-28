"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SectionEyebrow } from "@/components/website/SectionEyebrow";
import { XYVOO_FAQS } from "@/constants/faqs";

export function HomePricingFaqSection() {
  const [showAll, setShowAll] = useState(false);
  const [value, setValue] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();

  const filteredFaqs = useMemo(() => {
    if (!normalizedQuery) return XYVOO_FAQS;
    return XYVOO_FAQS.filter(
      (faq) =>
        faq.question.toLowerCase().includes(normalizedQuery) ||
        faq.answer.toLowerCase().includes(normalizedQuery) ||
        faq.category.toLowerCase().includes(normalizedQuery) ||
        faq.keywords.some((keyword) =>
          keyword.toLowerCase().includes(normalizedQuery),
        ),
    );
  }, [normalizedQuery]);

  const visibleFaqs = useMemo(() => {
    if (normalizedQuery) return filteredFaqs;
    return showAll ? filteredFaqs : filteredFaqs.slice(0, 5);
  }, [filteredFaqs, normalizedQuery, showAll]);

  const shouldShowToggle = !normalizedQuery && XYVOO_FAQS.length > 5;

  return (
    <section className="pb-24 pt-20" style={{ background: "var(--xyvoo-blue-subtle-bg-05)" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mx-auto max-w-[840px] text-center">
          <SectionEyebrow
            eyebrow="FAQ"
            title="Frequently Asked Questions"
            className="[&>h2]:[color:var(--xyvoo-products-navy-alt)] [&>p]:[color:var(--xyvoo-blue)]"
            titleClassName="text-[clamp(1.625rem,4.4vw,2.75rem)] font-extrabold leading-[1.12]"
          />
          <p
            className="mx-auto mt-5 max-w-[680px] text-[15px] leading-[1.75]"
            style={{ color: "var(--xyvoo-navy-muted-text)" }}
          >
            Answers to the most common questions about plans, billing, and onboarding.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-[1200px]">
          <div className="relative mb-4">
            <Search
              className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "rgb(var(--xyvoo-navy-rgb) / 0.36)" }}
            />
            <input
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setValue(undefined);
              }}
              placeholder="Search for your most important questions"
              className="h-12 w-full rounded-xl border bg-white pl-12 pr-4 text-[15px] outline-none transition"
              style={{
                borderColor: "rgb(var(--xyvoo-blue-rgb) / 0.14)",
                color: "var(--xyvoo-products-navy-alt)",
              }}
            />
          </div>

          <Accordion
            type="single"
            collapsible
            value={value}
            onValueChange={setValue}
            className="w-full space-y-3"
          >
            {visibleFaqs.map((faq) => (
              <AccordionItem
                key={`${faq.category}-${faq.question}`}
                value={`${faq.category}-${faq.question}`}
                className="overflow-hidden rounded-2xl border bg-white"
                style={{ borderColor: "rgb(var(--xyvoo-blue-rgb) / 0.12)" }}
              >
                <AccordionTrigger
                  className="group/accordion-trigger rounded-none px-5 py-5 text-[15px] font-bold leading-[1.4] hover:no-underline sm:px-6 [&>[data-slot=accordion-trigger-icon]]:hidden"
                  style={{ color: "var(--xyvoo-products-navy-alt)" }}
                >
                  <div className="flex w-full items-center justify-between gap-5">
                    <span>{faq.question}</span>
                    <span
                      className="text-[30px] font-light leading-none text-[var(--xyvoo-products-navy-alt)] group-aria-expanded/accordion-trigger:hidden"
                      aria-hidden="true"
                    >
                      +
                    </span>
                    <span
                      className="hidden text-[30px] font-light leading-none text-[var(--xyvoo-products-navy-alt)] group-aria-expanded/accordion-trigger:inline"
                      aria-hidden="true"
                    >
                      ×
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div
                    className="border-t px-5 pb-5 pt-3 text-[14px] leading-[1.75] sm:px-6"
                    style={{
                      color: "var(--xyvoo-navy-muted-text)",
                      borderColor: "rgb(var(--xyvoo-blue-rgb) / 0.1)",
                    }}
                  >
                    {faq.answer}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {shouldShowToggle && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => {
                const next = !showAll;
                setShowAll(next);
                setValue(undefined); // avoid keeping an open item that is no longer rendered
              }}
              className="cursor-pointer px-1 py-1 text-sm font-semibold transition-colors"
              style={{
                color: "var(--xyvoo-blue)",
              }}
            >
              {showAll ? "See less" : "See more"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

