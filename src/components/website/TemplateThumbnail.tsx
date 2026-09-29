"use client";

import { useEffect, useRef, useState } from "react";

/** Width the template is rendered at before being scaled down to fit the card. */
const RENDER_WIDTH = 1440;
const RENDER_HEIGHT = 900;

/**
 * Live, non-interactive thumbnail of a website template: the real page,
 * rendered at desktop width and scaled to the card. Hidden from assistive
 * tech and the tab order; the card's own heading and links describe it.
 */
export function TemplateThumbnail({ src, title }: { src: string; title: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const update = () => setScale(box.clientWidth / RENDER_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      className="relative aspect-[16/10] w-full overflow-hidden bg-[#F3ECE2]"
      aria-hidden
    >
      {scale > 0 && (
        <iframe
          src={src}
          title={title}
          tabIndex={-1}
          loading="lazy"
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: RENDER_WIDTH, height: RENDER_HEIGHT, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}
