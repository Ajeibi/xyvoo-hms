import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  PDFRef,
  PDFString,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { toPdfText, wrapText } from "./receipts-format";

/*
 * A small writer for tagged, accessible PDFs, used by receipts, invoices and
 * the analytics summary. Everything is real text in reading order. Each piece
 * of text is marked content linked into a structure tree (headings,
 * paragraphs, tables with header cells, a figure with alternative text), and
 * rules and page numbers are marked as artifacts, so screen readers read the
 * document as a document. Text is set in Noto Sans, which has the naira sign
 * and Yoruba letters such as ọ, ẹ and ṣ; if it can't be loaded, Helvetica is
 * used and toPdfText swaps what Helvetica can't draw ("₦" becomes "NGN").
 */

/** Bundled with the API routes by outputFileTracingIncludes in next.config.ts. */
const FONT_DIR = path.join(process.cwd(), "src", "assets", "fonts");
let fontBytes: Promise<[Uint8Array, Uint8Array] | null> | null = null;

/** Noto Sans regular and bold, read once per server. Null if the files can't be read. */
function loadFontBytes() {
  fontBytes ??= Promise.all([readFile(path.join(FONT_DIR, "NotoSans-Regular.ttf")), readFile(path.join(FONT_DIR, "NotoSans-Bold.ttf"))])
    .then(([regular, bold]) => [new Uint8Array(regular), new Uint8Array(bold)] as [Uint8Array, Uint8Array])
    .catch((error) => {
      console.error("[pdf] Noto Sans not found, using Helvetica", error);
      fontBytes = null;
      return null;
    });
  return fontBytes;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const INK = rgb(0.06, 0.09, 0.16); // slate-900
const MUTED = rgb(0.28, 0.33, 0.41); // slate-600: 7:1 on white
const RULE = rgb(0.8, 0.84, 0.88);
const BRAND = rgb(0, 0.33, 0.62); // dark blue, 7:1 on white

type MarkedRef = { page: number; mcid: number };
type StructNode = {
  type: string;
  kids: Array<StructNode | MarkedRef>;
  alt?: string;
  scope?: "Row" | "Column";
};

export type TableColumn = { header: string; width: number; align?: "left" | "right" };
export type TableCell = string | { text: string; note?: string; bold?: boolean };

export class TaggedPdf {
  private pages: { page: PDFPage; mcids: StructNode[] }[] = [];
  private root: StructNode = { type: "Document", kids: [] };
  private supported: Set<number>;
  y = 0;
  readonly left = MARGIN;
  readonly right = A4.width - MARGIN;
  readonly contentWidth = A4.width - MARGIN * 2;

  private constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.supported = new Set(font.getCharacterSet());
    this.addPage();
  }

  /** `lang` is the document's language tag (default "en-GB"). */
  static async create(meta: { title: string; subject: string; author: string; lang?: string }) {
    const doc = await PDFDocument.create();
    doc.setTitle(meta.title, { showInWindowTitleBar: true });
    doc.setSubject(meta.subject);
    doc.setAuthor(meta.author);
    doc.setCreator("XYVOO Storefront");
    doc.setProducer("XYVOO Storefront");
    doc.setLanguage(meta.lang ?? "en-GB");
    const noto = await loadFontBytes();
    if (noto) {
      try {
        doc.registerFontkit(fontkit);
        // Subset: only the letters used go into the file, which keeps receipts small.
        const [font, bold] = await Promise.all([doc.embedFont(noto[0], { subset: true }), doc.embedFont(noto[1], { subset: true })]);
        return new TaggedPdf(doc, font, bold);
      } catch (error) {
        console.error("[pdf] Noto Sans could not be embedded, using Helvetica", error);
      }
    }
    const [font, bold] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold)]);
    return new TaggedPdf(doc, font, bold);
  }

  /** Text the font can draw (see toPdfText). */
  text(value: string | null | undefined) {
    return toPdfText(value, this.supported);
  }

  private get current() {
    return this.pages[this.pages.length - 1];
  }

  private addPage() {
    const page = this.doc.addPage([A4.width, A4.height]);
    page.node.set(PDFName.of("StructParents"), PDFNumber.of(this.pages.length));
    this.pages.push({ page, mcids: [] });
    this.y = A4.height - MARGIN;
  }

  /** Starts a new page when fewer than `height` points are left. */
  ensureSpace(height: number) {
    if (this.y - height < MARGIN + 8) this.addPage();
  }

  node(type: string, parent: StructNode = this.root, extra: Partial<StructNode> = {}): StructNode {
    const n: StructNode = { type, kids: [], ...extra };
    parent.kids.push(n);
    return n;
  }

  /** Draws inside a marked-content sequence that belongs to `owner`. */
  private marked(owner: StructNode, draw: (page: PDFPage) => void) {
    const { page, mcids } = this.current;
    const mcid = mcids.length;
    mcids.push(owner);
    owner.kids.push({ page: this.pages.length - 1, mcid });
    // The property list is written inline (pdf-lib's operator types don't take a dictionary).
    page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of(owner.type), `<< /MCID ${mcid} >>`]));
    draw(page);
    page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  }

  /** Decoration that screen readers skip. */
  artifact(draw: (page: PDFPage) => void, page = this.current.page) {
    page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContent, [PDFName.of("Artifact")]));
    draw(page);
    page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  }

  rule(gap = 12) {
    this.ensureSpace(gap * 2);
    this.y -= gap;
    const y = this.y;
    this.artifact((page) => page.drawLine({ start: { x: this.left, y }, end: { x: this.right, y }, thickness: 0.75, color: RULE }));
    this.y -= gap;
  }

  space(points: number) {
    this.y -= points;
  }

  heading(value: string, level: 1 | 2 = 2) {
    const size = level === 1 ? 22 : 13;
    this.ensureSpace(size * 2.4);
    this.y -= level === 1 ? 4 : 10;
    this.lines(this.node(`H${level}`), value, { size, bold: true, color: level === 1 ? BRAND : INK, after: 6 });
  }

  paragraph(value: string, options: { size?: number; bold?: boolean; muted?: boolean; after?: number; parent?: StructNode; x?: number; width?: number } = {}) {
    if (!value) return;
    this.lines(this.node("P", options.parent), value, { size: options.size ?? 10.5, bold: options.bold, color: options.muted ? MUTED : INK, after: options.after ?? 4, x: options.x, width: options.width });
  }

  /** Wrapped lines of text under one structure element. */
  private lines(owner: StructNode, value: string, o: { size: number; bold?: boolean; color: ReturnType<typeof rgb>; after: number; x?: number; width?: number }) {
    const font = o.bold ? this.bold : this.font;
    const x = o.x ?? this.left;
    const lineHeight = o.size * 1.3;
    for (const line of wrapText(this.text(value), o.width ?? this.right - x, (s) => font.widthOfTextAtSize(s, o.size))) {
      this.ensureSpace(lineHeight);
      this.y -= lineHeight;
      const y = this.y + (lineHeight - o.size) / 2;
      this.marked(owner, (page) => page.drawText(line, { x, y, size: o.size, font, color: o.color }));
    }
    this.y -= o.after;
  }

  /** An image with alternative text, drawn at the top left; returns the width used. */
  figure(image: PDFImage, alt: string, maxHeight: number, maxWidth = 160) {
    const scale = Math.min(maxHeight / image.height, maxWidth / image.width, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    const top = this.y;
    this.marked(this.node("Figure", this.root, { alt: this.text(alt) }), (page) => page.drawImage(image, { x: this.left, y: top - height, width, height }));
    return { width, height };
  }

  /**
   * A table with a header row (unless `headerRow` is false) and, optionally,
   * the first cell of each row as a row header. Rows never split across pages;
   * the header row repeats on a new page.
   */
  table(columns: TableColumn[], rows: TableCell[][], options: { headerRow?: boolean; rowHeaders?: boolean; size?: number; boldLastRow?: boolean; zebra?: boolean } = {}) {
    const size = options.size ?? 10;
    const pad = 5;
    const table = this.node("Table");
    const xs = columns.reduce<number[]>((acc, c, i) => [...acc, i === 0 ? this.left : acc[i - 1] + columns[i - 1].width], []);
    const cellLines = (cell: TableCell, col: number, bold: boolean) => {
      const c = typeof cell === "string" ? { text: cell } : cell;
      const font = bold || c.bold ? this.bold : this.font;
      const width = columns[col].width - pad * 2;
      const main = wrapText(this.text(c.text), width, (s) => font.widthOfTextAtSize(s, size)).map((t) => ({ t, font, size, color: INK }));
      const note = c.note ? wrapText(this.text(c.note), width, (s) => this.font.widthOfTextAtSize(s, size - 1.5)).map((t) => ({ t, font: this.font, size: size - 1.5, color: MUTED })) : [];
      return [...main, ...note];
    };
    const heightOf = (prepared: ReturnType<typeof cellLines>[]) => Math.max(...prepared.map((ls) => ls.reduce((h, l) => h + l.size * 1.3, 0))) + pad * 2;
    const header = options.headerRow !== false ? columns.map((c) => c.header) : null;
    const drawRow = (cells: TableCell[], kind: "header" | "body", bold: boolean, shade: boolean) => {
      const prepared = cells.map((cell, i) => cellLines(cell, i, bold || kind === "header"));
      const height = heightOf(prepared);
      if (this.y - height < MARGIN + 8) {
        // Rows never split. After a page break the header repeats (as decoration: it's in the structure once).
        this.addPage();
        if (header && kind === "body") this.repeatHeader(columns, xs, size);
      }
      const top = this.y;
      if (shade || kind === "header") {
        this.artifact((page) => page.drawRectangle({ x: this.left, y: top - height, width: this.contentWidth, height, color: kind === "header" ? rgb(0.93, 0.95, 0.97) : rgb(0.97, 0.98, 0.99) }));
      }
      const tr = this.node("TR", table);
      prepared.forEach((lines, i) => {
        const isHeader = kind === "header" || (options.rowHeaders && i === 0);
        const cell = this.node(isHeader ? "TH" : "TD", tr, isHeader ? { scope: kind === "header" ? "Column" : "Row" } : {});
        let y = top - pad;
        for (const l of lines) {
          y -= l.size * 1.3;
          const w = l.font.widthOfTextAtSize(l.t, l.size);
          const x = columns[i].align === "right" ? xs[i] + columns[i].width - pad - w : xs[i] + pad;
          const baseline = y + l.size * 0.25;
          this.marked(cell, (page) => page.drawText(l.t, { x, y: baseline, size: l.size, font: l.font, color: l.color }));
        }
      });
      this.y = top - height;
      this.artifact((page) => page.drawLine({ start: { x: this.left, y: this.y }, end: { x: this.right, y: this.y }, thickness: 0.5, color: RULE }));
    };

    if (header) drawRow(header, "header", true, false);
    rows.forEach((row, index) => drawRow(row, "body", Boolean(options.boldLastRow && index === rows.length - 1), Boolean(options.zebra && index % 2 === 1)));
    this.y -= 8;
  }

  private repeatHeader(columns: TableColumn[], xs: number[], size: number) {
    const height = size * 1.3 + 10;
    const top = this.y;
    this.artifact((page) => {
      page.drawRectangle({ x: this.left, y: top - height, width: this.contentWidth, height, color: rgb(0.93, 0.95, 0.97) });
      columns.forEach((c, i) => {
        const t = this.text(c.header);
        const w = this.bold.widthOfTextAtSize(t, size);
        const x = c.align === "right" ? xs[i] + c.width - 5 - w : xs[i] + 5;
        page.drawText(t, { x, y: top - 5 - size * 1.3 + size * 0.25, size, font: this.bold, color: INK });
      });
    });
    this.y = top - height;
  }

  /** Adds page numbers, writes the structure tree and returns the file. `pageLabel` words them in another language. */
  async save(footer?: string, pageLabel: (page: number, total: number) => string = (page, total) => `Page ${page} of ${total}`) {
    const total = this.pages.length;
    this.pages.forEach(({ page }, i) => {
      const label = this.text(`${footer ? `${footer}  ·  ` : ""}${pageLabel(i + 1, total)}`);
      this.artifact((p) => p.drawText(label, { x: this.left, y: MARGIN - 20, size: 8, font: this.font, color: MUTED }), page);
    });
    this.writeStructureTree();
    return this.doc.save();
  }

  private writeStructureTree() {
    const ctx = this.doc.context;
    const pageRefs = this.pages.map((p) => p.page.ref);
    const treeRootRef = ctx.nextRef();
    const refs = new Map<StructNode, PDFRef>();

    const build = (node: StructNode, parentRef: PDFRef): PDFRef => {
      const ref = ctx.nextRef();
      refs.set(node, ref);
      const kids = PDFArray.withContext(ctx);
      for (const kid of node.kids) {
        if ("type" in kid) kids.push(build(kid, ref));
        else kids.push(ctx.obj({ Type: "MCR", Pg: pageRefs[kid.page], MCID: kid.mcid }));
      }
      const dict = ctx.obj({ Type: "StructElem", S: node.type, P: parentRef, K: kids }) as PDFDict;
      if (node.alt) dict.set(PDFName.of("Alt"), PDFString.of(node.alt));
      if (node.scope) dict.set(PDFName.of("A"), ctx.obj({ O: "Table", Scope: node.scope }));
      ctx.assign(ref, dict);
      return ref;
    };
    const documentRef = build(this.root, treeRootRef);

    const nums = PDFArray.withContext(ctx);
    this.pages.forEach((p, i) => {
      nums.push(PDFNumber.of(i));
      nums.push(ctx.obj(p.mcids.map((owner) => refs.get(owner)!)));
    });
    const parentTreeRef = ctx.register(ctx.obj({ Nums: nums }));
    ctx.assign(treeRootRef, ctx.obj({ Type: "StructTreeRoot", K: documentRef, ParentTree: parentTreeRef, ParentTreeNextKey: this.pages.length }));
    this.doc.catalog.set(PDFName.of("StructTreeRoot"), treeRootRef);
    this.doc.catalog.set(PDFName.of("MarkInfo"), ctx.obj({ Marked: true }));
    this.pages.forEach((p) => p.page.node.set(PDFName.of("Tabs"), PDFName.of("S")));
  }
}

export const pdfColours = { INK, MUTED, RULE, BRAND };

/** Bytes as a body Response accepts. */
export function pdfBody(bytes: Uint8Array) {
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
}
