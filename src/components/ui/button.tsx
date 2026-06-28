import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none transition-all duration-200 ease-out focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 motion-reduce:transition-colors motion-reduce:hover:translate-y-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:-translate-y-0.5 hover:bg-primary/92 hover:shadow-lg active:translate-y-0 active:shadow-sm active:bg-primary/85 [a]:hover:bg-primary/92",
        outline:
          "border-border bg-background hover:-translate-y-0.5 hover:bg-blue-50/90 hover:text-foreground hover:border-primary/45 hover:shadow-md active:translate-y-0 active:shadow-sm aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 dark:hover:border-primary/40",
        secondary:
          "bg-secondary text-secondary-foreground hover:-translate-y-px hover:bg-secondary/85 hover:shadow-sm active:translate-y-0 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:-translate-y-px hover:bg-muted/90 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground active:translate-y-0 dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        /** Home products HMS card — Material blue, white label (pair with size `product`) */
        productHms:
          "border-2 border-[var(--xyvoo-blue-mid)] bg-[var(--xyvoo-blue-mid)] text-white shadow-none hover:-translate-y-0.5 hover:border-[var(--xyvoo-blue-deep)] hover:bg-[var(--xyvoo-blue-deep)] hover:shadow-[0_8px_24px_rgb(33_150_243_/_0.4)] active:translate-y-0 active:shadow-sm motion-reduce:hover:translate-y-0",
        /** Home products Store card — teal fill, navy label (pair with size `product`) */
        productStore:
          "border-2 border-[var(--xyvoo-teal-product)] bg-[var(--xyvoo-teal-product)] text-[var(--xyvoo-products-navy-alt)] shadow-none hover:-translate-y-0.5 hover:border-[var(--xyvoo-teal-product-hover)] hover:bg-[var(--xyvoo-teal-product-hover)] hover:shadow-[0_8px_24px_rgb(77_208_196_/_0.4)] active:translate-y-0 active:shadow-sm motion-reduce:hover:translate-y-0",
      },
      size: {
        /** Marketing product CTAs — use with variant `productHms` or `productStore` */
        product:
          "!h-auto min-h-11 gap-2 rounded-lg px-7 py-3.5 text-[15px] font-semibold has-data-[icon=inline-end]:pr-6 has-data-[icon=inline-start]:pl-6 [&_svg:not([class*='size-'])]:size-4",
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xl: "h-11 min-h-11 gap-2 rounded-xl px-7 text-base font-semibold has-data-[icon=inline-end]:pr-6 has-data-[icon=inline-start]:pl-6 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, buttonVariants }
