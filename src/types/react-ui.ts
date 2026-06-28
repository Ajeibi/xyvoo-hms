import type { ReactNode } from "react";

export type WithChildren = { children: ReactNode };

export type FadeInSectionProps = WithChildren & {
  delay?: number;
};
