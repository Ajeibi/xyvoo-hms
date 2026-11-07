"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export type SolutionFeatureGroup = {
  eyebrow: string;
  title: string;
  intro: string;
  items: { title: string; description: string }[];
  /** `side` is the screen edge the image sits against. Set it when the image
   * is cropped on one side, so the cropped side meets the screen edge.
   * Omitted = alternate by position (first on the right, second on the left). */
  image: { src: string; alt: string; width: number; height: number; side?: "left" | "right" };
};

/** Features grouped into a few full-width sections, same pattern as the About
 * page's "How it works": the heading stays pinned while the numbered items
 * scroll past it, and a pinned image sits flush against the screen edge.
 * Sides alternate: group 1 has the image on the right, group 2 on the left. */
export function SolutionFeatureGroups({
  headingId,
  groups,
  accentRgb,
}: {
  headingId: string;
  groups: SolutionFeatureGroup[];
  accentRgb: string;
}) {
  let counter = 0;

  return (
    <>
      {groups.map((group, gi) => {
        const imageLeft = group.image.side ? group.image.side === "left" : gi % 2 === 1;
        const bg = gi % 2 === 0 ? "bg-white" : "bg-slate-50";
        const headBg = gi % 2 === 0 ? "bg-white" : "bg-slate-50";
        // Image side has no padding so it touches the edge; the text side
        // lines up with the 1200px container used elsewhere on the page.
        const pad = imageLeft
          ? "lg:pl-0 lg:pr-[max(1.5rem,calc((100%-1200px)/2))]"
          : "lg:pr-0 lg:pl-[max(1.5rem,calc((100%-1200px)/2))]";

        return (
          <section
            key={group.title}
            aria-labelledby={gi === 0 ? headingId : undefined}
            className={`overflow-x-clip border-t border-slate-100 px-6 py-20 md:px-12 lg:py-28 lg:pt-4 ${bg} ${pad}`}
          >
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-10">
              <div className={imageLeft ? "lg:order-2" : "lg:order-1"}>
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className={`z-10 pb-6 lg:sticky lg:top-0 lg:pt-24 ${headBg}`}
                >
                  <p
                    className="mb-3 text-eyebrow font-bold uppercase tracking-widest"
                    style={{ color: `rgb(${accentRgb})` }}
                  >
                    {group.eyebrow}
                  </p>
                  <h3
                    id={gi === 0 ? headingId : undefined}
                    className="mb-4 text-h3 font-black leading-tight text-xyvoo-navy"
                  >
                    {group.title}
                  </h3>
                  <p className="text-p leading-relaxed text-slate-500 lg:max-w-[42ch]">{group.intro}</p>
                </motion.div>

                <ul className="mt-6 flex flex-col">
                  {group.items.map((item) => {
                    counter += 1;
                    const n = counter;
                    return (
                      <motion.li
                        key={item.title}
                        initial={{ opacity: 0, x: imageLeft ? 40 : -40 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-60px" }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="group border-t border-slate-200 py-8 lg:py-12"
                      >
                        <span className="mb-2 block font-mono text-sm font-semibold tracking-wide text-xyvoo-navy/30 transition-colors duration-300 group-hover:text-xyvoo-blue">
                          {String(n).padStart(2, "0")}
                        </span>
                        <h5 className="text-h5 font-semibold leading-snug text-xyvoo-navy transition-colors duration-300 group-hover:text-xyvoo-blue">
                          {item.title}
                        </h5>
                        <p className="mt-2 text-p leading-relaxed text-slate-500 lg:max-w-[46ch]">
                          {item.description}
                        </p>
                      </motion.li>
                    );
                  })}
                </ul>
              </div>

              <div className={`lg:sticky lg:top-28 lg:self-start ${imageLeft ? "lg:order-1" : "lg:order-2"}`}>
                <motion.div
                  initial={{ opacity: 0, x: imageLeft ? -40 : 40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  className="-mx-6 md:-mx-12 lg:mx-0 lg:h-[calc(100vh-8rem)] lg:max-h-[720px]"
                >
                  <Image
                    src={group.image.src}
                    alt={group.image.alt}
                    width={group.image.width}
                    height={group.image.height}
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className={`h-auto w-full lg:h-full lg:object-contain ${
                      imageLeft ? "lg:object-left" : "lg:object-right"
                    }`}
                  />
                </motion.div>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
