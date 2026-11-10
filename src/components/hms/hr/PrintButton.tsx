"use client";

import { Printer } from "lucide-react";
import { hmsButton } from "@/components/hms/hms-ui";

export function PrintButton() {
  return (
    <button type="button" className={hmsButton.secondary} onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden /> Print or save as PDF
    </button>
  );
}
