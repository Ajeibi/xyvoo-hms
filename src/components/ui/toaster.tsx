"use client";

import { usePathname } from "next/navigation";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";

/**
 * Success toasts on the storefront product (dashboard, sign-up, sign-in) use
 * its mint. Dark text, because white on the mint isn't readable enough.
 */
const STOREFRONT_SUCCESS = {
  toast: "border-xyvoo-teal-product-hover bg-xyvoo-teal-product-hover text-[#062a27]",
  description: "group-[.success]:text-[#062a27] opacity-100",
  close: "group-[.success]:text-[#062a27]/70 group-[.success]:hover:text-[#062a27]",
};

export function Toaster() {
  const { toasts } = useToast();
  const storefront = (usePathname() ?? "").includes("storefront");

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, ...props }) => {
        const mint = storefront && props.variant === "success";
        return (
          <Toast key={id} {...props} className={mint ? STOREFRONT_SUCCESS.toast : props.className}>
            <div className="grid gap-1">
              {title ? <ToastTitle>{title}</ToastTitle> : null}
              {description ? <ToastDescription className={mint ? STOREFRONT_SUCCESS.description : undefined}>{description}</ToastDescription> : null}
            </div>
            {action}
            <ToastClose className={mint ? STOREFRONT_SUCCESS.close : undefined} />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
