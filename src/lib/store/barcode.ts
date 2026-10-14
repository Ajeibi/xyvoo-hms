/*
 * Barcodes for printed labels, drawn as plain bars so nothing has to be
 * downloaded: EAN-13 and UPC-A for the numbers on most packaging, and Code 128
 * for anything else (letters, dashes, shorter numbers). `barcodeBars` returns
 * the bars as widths in modules, starting with a bar; the page draws them.
 */

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** The check digit for the first 12 digits of an EAN-13. */
export function ean13CheckDigit(first12: string) {
  const sum = [...first12].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export const isEan13 = (code: string) => /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
/** A 12-digit UPC-A is an EAN-13 with a leading zero. */
export const isUpcA = (code: string) => /^\d{12}$/.test(code) && isEan13(`0${code}`);

function ean13Modules(code: string) {
  const parity = PARITY[Number(code[0])];
  let bits = "101";
  for (let i = 1; i <= 6; i += 1) bits += (parity[i - 1] === "L" ? L : G)[Number(code[i])];
  bits += "01010";
  for (let i = 7; i <= 12; i += 1) bits += R[Number(code[i])];
  return `${bits}101`;
}

// Code 128: each symbol is six widths (bar, space, bar, space, bar, space) adding to 11 modules; the stop is seven adding to 13.
export const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
];
export const CODE128_STOP = "2331112";

/** Code 128 character set B: printable ASCII from space (32) to tilde (126). */
export const canCode128 = (code: string) => code.length > 0 && code.length <= 40 && [...code].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126);

function code128Widths(code: string) {
  const values = [104, ...[...code].map((c) => c.charCodeAt(0) - 32)];
  const checksum = values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103;
  const patterns = [...values, checksum].map((v) => CODE128_PATTERNS[v]);
  return [...patterns, CODE128_STOP].join("").split("").map(Number);
}

export type BarcodeKind = "ean13" | "upca" | "code128";

/** Which kind of barcode this number or text should be drawn as, or null if it can't be drawn. */
export function barcodeKind(raw: string): BarcodeKind | null {
  const code = raw.trim();
  if (isEan13(code)) return "ean13";
  if (isUpcA(code)) return "upca";
  return canCode128(code) ? "code128" : null;
}

/** The bars: widths in modules, alternating bar, space, bar... starting with a bar. Null if it can't be drawn. */
export function barcodeBars(raw: string): { kind: BarcodeKind; widths: number[]; text: string } | null {
  const code = raw.trim();
  const kind = barcodeKind(code);
  if (!kind) return null;
  if (kind === "code128") return { kind, widths: code128Widths(code), text: code };
  const ean = kind === "upca" ? `0${code}` : code;
  const bits = ean13Modules(ean);
  const widths: number[] = [];
  let run = 1;
  for (let i = 1; i <= bits.length; i += 1) {
    if (bits[i] === bits[i - 1] && i < bits.length) run += 1;
    else {
      widths.push(run);
      run = 1;
    }
  }
  return { kind, widths, text: code };
}
