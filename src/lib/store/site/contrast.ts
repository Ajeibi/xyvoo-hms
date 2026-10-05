/** WCAG 2.x colour contrast helpers for merchant-chosen theme colours. */

export const HEX_COLOUR_PATTERN = /^#[0-9a-f]{6}$/i;

function channel(value: number) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): [number, number, number] {
  if (!HEX_COLOUR_PATTERN.test(hex)) throw new Error(`Invalid colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16)) as [number, number, number];
}

export function relativeLuminance(hex: string) {
  const [r, g, b] = parseHex(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mixes the colour towards black by `amount` (0–1). Used to derive hover shades. */
export function darken(hex: string, amount: number) {
  const mixed = parseHex(hex).map((v) => Math.round(v * (1 - amount)));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Body text and button labels must reach WCAG AA for normal text. */
export const MIN_TEXT_CONTRAST = 4.5;
