"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { STOREFRONT_ROOT_DOMAIN } from "@/lib/store/subdomain";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value"> & {
  value: string;
  /** Focus ring colour for the product, e.g. `focus-within:ring-xyvoo-teal-product-hover`. */
  ringClassName?: string;
};

/**
 * Web address field that reads as one address, e.g. `vivi.getxyvoo.com`.
 * A hidden copy of the text sets the input's width, so the domain sits right after
 * what's typed instead of at the far edge of the box.
 */
export function SubdomainInput({ value, placeholder, ringClassName, className, ...props }: Props) {
  return (
    <div
      onClick={(e) => e.currentTarget.querySelector("input")?.focus()}
      className={cn(
        "flex cursor-text items-center overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus-within:ring-2",
        ringClassName,
        className,
      )}
    >
      <span className="relative min-w-0">
        {/* Sets the width; the input sits on top of it. 1px of padding leaves room for the caret. */}
        <span aria-hidden className="invisible block overflow-hidden whitespace-pre pr-px">
          {value || placeholder}
        </span>
        <input
          {...props}
          value={value}
          placeholder={placeholder}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="absolute inset-0 w-full min-w-0 bg-transparent outline-none"
        />
      </span>
      <span className="shrink-0 text-slate-400">.{STOREFRONT_ROOT_DOMAIN}</span>
    </div>
  );
}
