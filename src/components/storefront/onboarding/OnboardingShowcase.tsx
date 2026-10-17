import Image from "next/image";
import type { OnboardingStep } from "@/lib/store/site/onboarding";

/*
 * The photo beside each of the first four setup steps: a merchant or a member
 * of the XYVOO team, with a few words from them over the picture.
 */

type Showcase = { image: string; name: string; role: string; quote: string };

export const ONBOARDING_SHOWCASE: Partial<Record<OnboardingStep, Showcase>> = {
  basics: {
    image: "/onboarding/oche-ajeibi.webp",
    name: "Oche Ajeibi",
    role: "XYVOO",
    quote: "We built XYVOO so you can spend less time on the tech and more time on the business you love.",
  },
  template: {
    image: "/onboarding/nevan-ishaku.webp",
    name: "Nevan Ishaku",
    role: "Nevan Hairs",
    quote: "XYVOO turned my DMs into a real shop. Single pieces or wholesale, the orders and payments now come in while I sleep.",
  },
  brand: {
    image: "/onboarding/elaipu-agada.webp",
    name: "Elaipu Agada",
    role: "XYVOO",
    quote: "Your shop should look and sound like you. Make it yours, and we’ll help you tell the world.",
  },
  essentials: {
    image: "/onboarding/faith-ochigbo.webp",
    name: "Faith Ochigbo",
    role: "Fay Fashion",
    quote: "With XYVOO, Fay Fashion finally looks like the brand I pictured, and customers pay before I’ve even replied.",
  },
};

export default function OnboardingShowcase({ showcase }: { showcase: Showcase }) {
  return (
    <figure className="relative isolate overflow-hidden rounded-3xl bg-slate-900 lg:h-[calc(100vh-12rem)] lg:min-h-[32rem]">
      <Image
        src={showcase.image}
        alt={`Portrait of ${showcase.name}`}
        fill
        preload
        sizes="(min-width: 1024px) 40vw, 1px"
        className="-z-10 object-cover object-top"
      />
      {/* Dark at the bottom so the white words stay readable on any photo. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/35 to-transparent" aria-hidden />
      <div className="flex h-full flex-col justify-end p-8 text-white">
        <blockquote className="text-xl font-bold leading-snug">
          <p>{showcase.quote}</p>
        </blockquote>
        <figcaption className="mt-4 text-sm">
          <span className="font-semibold text-white">{showcase.name}</span>
          <span className="text-white/70"> · </span>
          <span className="font-medium text-xyvoo-blue-light">{showcase.role}</span>
        </figcaption>
      </div>
    </figure>
  );
}
