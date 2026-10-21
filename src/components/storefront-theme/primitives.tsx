import Image from "next/image";
import Link from "next/link";

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
  eager = false,
}: {
  src: string;
  alt: string;
  sizes: string;
  /** The page's main image (a hero, a product photo): preloaded from the <head>. One per page. */
  priority?: boolean;
  /** One of several images that could be the main one (a grid's first row): fetched early, not lazily. */
  eager?: boolean;
}) {
  if (SUPABASE_STORAGE_PREFIX && src.startsWith(SUPABASE_STORAGE_PREFIX)) {
    if (priority) return <Image src={src} alt={alt} fill sizes={sizes} preload />;
    return <Image src={src} alt={alt} fill sizes={sizes} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} />;
  }
  const early = priority || eager;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external hosts aren't in next/image's allow-list
    <img src={src} alt={alt} loading={early ? "eager" : "lazy"} decoding="async" fetchPriority={early ? "high" : "auto"} />
  );
}

/**
 * A `.media` block that takes the shopper to `href` when there is one. The link
 * is laid over the image, hidden from assistive tech and out of the tab order,
 * because the section's own text link already names the destination. The image
 * stays outside the link, so its alt text is still read out.
 */
export function MediaLink({ href, className, children }: { href?: string; className: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      {children}
      {href ? <Link href={href} className="media__link" tabIndex={-1} aria-hidden="true" /> : null}
    </div>
  );
}

/** In the shopper's chosen currency, so it lives in a client component. */
export { default as Price } from "./Price";

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
