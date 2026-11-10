/** Oversized, barely-there wordmark sitting behind a hero's content and
 * bleeding off the right edge — the same watermark treatment as the portfolio
 * hero. Render inside a `relative overflow-hidden` hero section, before the
 * content (which should be `relative z-10`). */
export function HeroWatermark({
  text,
  tone = "light",
}: {
  text: string;
  tone?: "light" | "dark";
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -right-[4vw] top-[10%] z-0 select-none"
    >
      <span
        className={
          "block whitespace-nowrap font-[family-name:var(--font-fraunces)] text-[32vw] font-normal italic lowercase leading-none tracking-tight lg:text-[20vw] " +
          (tone === "dark" ? "text-white/[0.045]" : "text-xyvoo-navy/[0.045]")
        }
      >
        {text}
      </span>
    </div>
  );
}
