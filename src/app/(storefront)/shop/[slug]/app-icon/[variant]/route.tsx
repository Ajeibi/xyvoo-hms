import { ImageResponse } from "next/og";
import { storeInitials } from "@/lib/store/app";
import { getStorefront } from "@/lib/store/site/storefront";

/*
 * The store app's icon, drawn from the store's own brand: its logo (PNG or JPG)
 * on the page colour, or its initials on the accent colour. Variants:
 *   192, 512   home-screen icons
 *   maskable   512px with a safe zone, so Android can crop it to any shape
 *   apple      180px, for iPhone and iPad home screens
 *   badge      96px white initials on transparent, for the Android status bar
 */
const VARIANTS = {
  "192": { size: 192, padding: 0.12 },
  "512": { size: 512, padding: 0.12 },
  maskable: { size: 512, padding: 0.22 },
  apple: { size: 180, padding: 0.1 },
  badge: { size: 96, padding: 0.08 },
} as const;

type Variant = keyof typeof VARIANTS;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; variant: string }> }) {
  const { slug, variant } = await params;
  if (!(variant in VARIANTS)) return new Response("Not found", { status: 404 });
  const storefront = await getStorefront(slug);
  if (!storefront) return new Response("Not found", { status: 404 });

  const { size, padding } = VARIANTS[variant as Variant];
  const { colours, onAccent } = storefront.site.theme;
  const logo = storefront.site.brand.logoUrl;
  const usableLogo = logo && /^https:\/\/.+\.(png|jpe?g)(\?.*)?$/i.test(logo) && variant !== "badge";
  const initials = storeInitials(storefront.storeName);
  const inset = Math.round(size * padding);

  const image = usableLogo ? (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: colours.bg, padding: inset }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by ImageResponse */}
      <img src={logo} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
    </div>
  ) : (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: variant === "badge" ? "transparent" : colours.accent,
        color: variant === "badge" ? "#ffffff" : onAccent,
        fontSize: Math.round((size - inset * 2) * (initials.length > 1 ? 0.48 : 0.6)),
        fontWeight: 700,
        letterSpacing: -1,
      }}
    >
      {initials}
    </div>
  );

  return new ImageResponse(image, {
    width: size,
    height: size,
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
