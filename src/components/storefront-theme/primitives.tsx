import Image from "next/image";
import Link from "next/link";
import { formatShopCurrency } from "@/lib/shop/format";

export const ICON_SPRITE = "/sf-assets/icons.svg";

export type IconName =
  | "search" | "user" | "heart" | "bag" | "menu" | "close" | "arrow-right" | "chevron-down" | "chevron-left"
  | "chevron-right" | "plus" | "minus" | "leaf" | "truck" | "returns" | "shield" | "shield-plain" | "cloud"
  | "diamond" | "home" | "image" | "star" | "star-empty" | "pin" | "phone" | "mail" | "clock" | "lock"
  | "filter" | "check" | "check-circle" | "package" | "sparkle" | "card" | "headset" | "recycle" | "users"
  | "calendar" | "instagram" | "facebook" | "pinterest" | "youtube" | "tiktok";

const ICON_NAMES = new Set<string>([
  "search", "user", "heart", "bag", "menu", "close", "arrow-right", "chevron-down", "chevron-left", "chevron-right",
  "plus", "minus", "leaf", "truck", "returns", "shield", "shield-plain", "cloud", "diamond", "home", "image", "star",
  "star-empty", "pin", "phone", "mail", "clock", "lock", "filter", "check", "check-circle", "package", "sparkle",
  "card", "headset", "recycle", "users", "calendar", "instagram", "facebook", "pinterest", "youtube", "tiktok",
]);

/** Maps merchant-chosen icon names (which may be free text) onto the sprite, with a safe default. */
export function toIconName(value: string | null | undefined, fallback: IconName = "check"): IconName {
  if (!value) return fallback;
  if (value === "refresh") return "returns";
  return ICON_NAMES.has(value) ? (value as IconName) : fallback;
}

export function Icon({ name, size, className }: { name: IconName; size?: "sm" | "lg"; className?: string }) {
  const classes = ["icon", size ? `icon--${size}` : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <svg className={classes} aria-hidden="true" focusable="false">
      <use href={`${ICON_SPRITE}#${name}`} />
    </svg>
  );
}

const SUPABASE_STORAGE_PREFIX = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/`
  : null;

/**
 * Fills its `.media` parent. Supabase Storage images go through next/image
 * (resized, modern formats); anything else, e.g. an imported product photo on
 * another host, falls back to a lazy plain <img>.
 */
export function StoreImage({
  src,
  alt,
  sizes,
  priority = false,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
}) {
  if (SUPABASE_STORAGE_PREFIX && src.startsWith(SUPABASE_STORAGE_PREFIX)) {
    return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external hosts aren't in next/image's allow-list
    <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"} />
  );
}

export function Price({ amount, compareAt, currency }: { amount: number; compareAt?: number | null; currency: string | null }) {
  if (compareAt != null && compareAt > amount) {
    return (
      <>
        <span className="visually-hidden">Sale price </span>
        {formatShopCurrency(amount, currency)} <s><span className="visually-hidden">was </span>{formatShopCurrency(compareAt, currency)}</s>
      </>
    );
  }
  return <>{formatShopCurrency(amount, currency)}</>;
}

export function Rating({ value, count }: { value: number; count?: number }) {
  const rounded = Math.round(value);
  const label = count != null ? `Rated ${value.toFixed(1)} out of 5 from ${count} ${count === 1 ? "review" : "reviews"}` : `Rated ${value} out of 5`;
  return (
    <p className="rating">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: 5 }, (_, i) => (
        <Icon key={i} name={i < rounded ? "star" : "star-empty"} />
      ))}
      {count != null ? (
        <span className="rating__count" aria-hidden="true">
          ({count})
        </span>
      ) : null}
    </p>
  );
}

export function Breadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) =>
          item.href && i < items.length - 1 ? (
            <li key={i}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ) : (
            <li key={i}>
              <span aria-current="page">{item.label}</span>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}

/** Section heading row: eyebrow + h2 with an optional "view all" link. */
export function SectionHead({ id, eyebrow, heading, link }: { id: string; eyebrow?: string; heading: string; link?: { label: string; href: string } }) {
  return (
    <div className="section-head">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="h-section" id={id}>
          {heading}
        </h2>
      </div>
      {link ? (
        <Link className="link-arrow" href={link.href}>
          {link.label} <Icon name="arrow-right" size="sm" />
        </Link>
      ) : null}
    </div>
  );
}
