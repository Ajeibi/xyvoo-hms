import type { CSSProperties } from "react";

/** Small glowing dots that travel slowly along an invisible grid — left to
 * right and top to bottom — each trailed by a short comet tail, making a
 * grid-line background read as "alive" rather than a static texture.
 * Originally built for the home hero; shared wherever that same grid
 * treatment is reused. Render as an absolutely-positioned overlay behind
 * your content, on top of a grid-line background-image. */
export function GridPulses({ color }: { color: string }) {
  // Plain CSS drop-shadow instead of an SVG <filter> reference: if an SVG
  // filter fails to resolve (browser quirks, timing), the whole element it's
  // attached to renders invisible rather than just losing the glow — that
  // silent-invisibility failure mode is what was making these pulses vanish
  // entirely. drop-shadow degrades gracefully instead.
  const glowStyle: CSSProperties = {
    filter: `drop-shadow(0 0 4px ${color}) drop-shadow(0 0 1.5px ${color})`,
  };

  // Comet trail built from plain filled circles at shrinking size/opacity
  // (not an SVG <linearGradient> reference) — same reasoning as the glow
  // above: url(#...) references in this environment have shown a
  // fail-invisible failure mode, so the trail avoids that mechanism too.
  const TRAIL = [
    { offset: 6, r: 1.6, opacity: 0.45 },
    { offset: 12, r: 1.1, opacity: 0.25 },
    { offset: 18, r: 0.7, opacity: 0.12 },
  ];

  // Small glowing dot ("light bulb"), moving slowly along the full length
  // of its track via a CSS transform, trailed by the comet dots above.
  // Spread across the full section (not clustered in one corner) so there's
  // enough of them on screen at once to read as "alive" rather than sparse.
  const hLocations = [
    { y: 80, duration: 24, delay: 0 },
    { y: 160, duration: 31, delay: 4 },
    { y: 240, duration: 20, delay: 9 },
    { y: 320, duration: 35, delay: 13 },
    { y: 400, duration: 26, delay: 18 },
    { y: 480, duration: 22, delay: 1 },
    { y: 560, duration: 33, delay: 7 },
    { y: 640, duration: 28, delay: 12 },
    { y: 720, duration: 24, delay: 16 },
    { y: 800, duration: 37, delay: 3 },
    { y: 880, duration: 21, delay: 19 },
    { y: 960, duration: 30, delay: 8 },
  ];
  const vLocations = [
    { x: 80, duration: 27, delay: 2 },
    { x: 240, duration: 33, delay: 6 },
    { x: 400, duration: 22, delay: 11 },
    { x: 560, duration: 36, delay: 15 },
    { x: 720, duration: 25, delay: 20 },
    { x: 880, duration: 29, delay: 5 },
    { x: 1040, duration: 23, delay: 14 },
    { x: 1200, duration: 34, delay: 0 },
    { x: 1360, duration: 20, delay: 10 },
    { x: 1520, duration: 31, delay: 17 },
    { x: 1680, duration: 26, delay: 21 },
    { x: 1840, duration: 38, delay: 9 },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {hLocations.map((h, i) => (
          <g key={`h-${i}`} className={`animate-grid-dot-h-${i}`}>
            {TRAIL.map((t, ti) => (
              <circle key={ti} cx={-t.offset} cy={h.y} r={t.r} fill={color} opacity={t.opacity} />
            ))}
            <circle cx="0" cy={h.y} r="2.5" fill={color} style={glowStyle} />
          </g>
        ))}
        {vLocations.map((v, i) => (
          <g key={`v-${i}`} className={`animate-grid-dot-v-${i}`}>
            {TRAIL.map((t, ti) => (
              <circle key={ti} cx={v.x} cy={-t.offset} r={t.r} fill={color} opacity={t.opacity} />
            ))}
            <circle cx={v.x} cy="0" r="2.5" fill={color} style={glowStyle} />
          </g>
        ))}
      </svg>
      <style>{`
        @keyframes gridDotH {
          0% { transform: translateX(0); opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { transform: translateX(3000px); opacity: 0; }
        }
        @keyframes gridDotV {
          0% { transform: translateY(0); opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { transform: translateY(3000px); opacity: 0; }
        }
        ${hLocations
          .map(
            (h, i) =>
              `.animate-grid-dot-h-${i} { animation: gridDotH ${h.duration}s linear infinite; animation-delay: ${h.delay}s; }`
          )
          .join("\n")}
        ${vLocations
          .map(
            (v, i) =>
              `.animate-grid-dot-v-${i} { animation: gridDotV ${v.duration}s linear infinite; animation-delay: ${v.delay}s; }`
          )
          .join("\n")}
      `}</style>
    </div>
  );
}
