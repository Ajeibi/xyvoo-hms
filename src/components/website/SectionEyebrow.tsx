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
          "mb-4 inline-block text-eyebrow font-bold uppercase tracking-[0.22em] text-xyvoo-blue-deep",
          eyebrowClassName,
        )}
      >
        {eyebrow}
      </p>
      <h3
        id={titleId}
        className={cn(
          "text-balance text-h3 font-extrabold leading-[1.15] tracking-tight text-xyvoo-navy",
          titleClassName,
        )}
      >
        {title}
      </h3>
    </div>
  );
}
