/*
 * Turns a colour a merchant types in plain words ("navy", "wine", "rose gold")
 * into a hex code. Browsers know the standard web colour names; these are
 * everyday names they don't.
 */

const EXTRA_NAMES: Record<string, string> = {
  wine: "#722F37",
  burgundy: "#800020",
  maroon: "#800000",
  ruby: "#9B111E",
  emerald: "#047857",
  mint: "#3EB489",
  sage: "#7C8C5E",
  olive: "#556B2F",
  bottlegreen: "#006A4E",
  mustard: "#C99A0E",
  gold: "#B8860B",
  nude: "#C8A27C",
  peach: "#F4A58A",
  coral: "#E8664F",
  rust: "#B7410E",
  terracotta: "#C65D3B",
  cream: "#F3E9D2",
  champagne: "#E8D3A9",
  mauve: "#915F6D",
  lilac: "#B593C8",
  lavender: "#8E7CC3",
  rosegold: "#B76E79",
  blush: "#DE8A9A",
  cobalt: "#0047AB",
  royalblue: "#2D4FC9",
  babyblue: "#7FB2E5",
  skyblue: "#4A9BD9",
  navyblue: "#1F2A5A",
  charcoal: "#36454F",
  ash: "#6E6E6E",
};

/** Ready-made brand colours to tap, for merchants who'd rather not type. */
export const PRESET_COLOURS: Array<{ name: string; hex: string }> = [
  { name: "Navy", hex: "#1F2A5A" },
  { name: "Royal blue", hex: "#2D4FC9" },
  { name: "Teal", hex: "#0F766E" },
  { name: "Emerald", hex: "#047857" },
  { name: "Olive", hex: "#556B2F" },
  { name: "Mustard", hex: "#C99A0E" },
  { name: "Rust", hex: "#B7410E" },
  { name: "Red", hex: "#C62828" },
  { name: "Wine", hex: "#722F37" },
  { name: "Pink", hex: "#D63384" },
  { name: "Purple", hex: "#6B3FA0" },
  { name: "Black", hex: "#1A1A1A" },
];

const key = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, "");
const EXTRA = Object.fromEntries(Object.entries(EXTRA_NAMES).map(([name, hex]) => [key(name), hex]));

/** The hex code for a typed colour name or code, or null if it isn't one we recognise. Browser only. */
export function colourFromText(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  const extra = EXTRA[key(raw)];
  if (extra) return extra;

  const hex = raw.replace(/^#?/, "#");
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(hex)) return `#${hex.slice(1).split("").map((c) => c + c).join("")}`.toUpperCase();

  // Let the browser read standard names ("skyblue", "darkgreen"). An unknown
  // value leaves the fill style unchanged, so start from a sentinel to spot it.
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  const sentinel = "#010203";
  ctx.fillStyle = sentinel;
  ctx.fillStyle = key(raw);
  const result = String(ctx.fillStyle);
  if (result === sentinel || !/^#[0-9a-f]{6}$/i.test(result)) return null;
  return result.toUpperCase();
}
