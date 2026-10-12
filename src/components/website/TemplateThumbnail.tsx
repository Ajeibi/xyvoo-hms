import Image from "next/image";

/**
 * Thumbnail of a website template: a 1440×900 screenshot of its home page
 * (public/images/template-thumbnails/<slug>.png, made by
 * scripts/capture-template-thumbnails.mjs). A picture rather than a framed live
 * page, so a grid of cards costs a few small images instead of whole websites.
 * Decorative: the card's own heading and links describe the template.
 */
export function TemplateThumbnail({ slug, sizes }: { slug: string; sizes?: string }) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#F3ECE2]">
      <Image
        src={`/images/template-thumbnails/${slug}.png`}
        alt=""
        fill
        sizes={sizes ?? "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"}
        className="object-cover object-top"
      />
    </div>
  );
}
