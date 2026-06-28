import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionEyebrowProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  titleId?: string;
  className?: string;
  eyebrowClassName?: string;
  titleClassName?: string;
};

export function SectionEyebrow({
  eyebrow,
  title,
  titleId,
  className,
  eyebrowClassName,
  titleClassName,
}: SectionEyebrowProps) {
  return (
    <div className={className}>
      <p
        className={cn(
          "mb-4 inline-block text-[11px] font-bold uppercase tracking-[0.22em] text-xyvoo-blue",
          eyebrowClassName,
        )}
      >
        {eyebrow}
      </p>
      <h2
        id={titleId}
        className={cn(
          "text-balance text-[clamp(1.75rem,4vw,2.75rem)] font-extrabold leading-[1.15] tracking-tight text-xyvoo-navy",
          titleClassName,
        )}
      >
        {title}
      </h2>
    </div>
  );
}
