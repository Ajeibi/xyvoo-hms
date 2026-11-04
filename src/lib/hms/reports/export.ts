import ExcelJS from "exceljs";
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { toCsv } from "@/lib/csv";
import { toPdfText, wrapText } from "@/lib/store/receipts-format";
import {
  cellKind,
  cellValue,
  documentToRows,
  formatCell,
  type ReportCell,
  type ReportColumn,
  type ReportDocument,
  type ReportSection,
} from "@/lib/hms/reports/model";

export type ReportFileFormat = "xlsx" | "pdf" | "csv";

export const REPORT_FILE_TYPES: Record<ReportFileFormat, { contentType: string; extension: string }> = {
  xlsx: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" },
  pdf: { contentType: "application/pdf", extension: "pdf" },
  csv: { contentType: "text/csv; charset=utf-8", extension: "csv" },
};

export function reportFileName(doc: ReportDocument, format: ReportFileFormat, stamp: string): string {
  const base = doc.key.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  return `${base}-${stamp}.${REPORT_FILE_TYPES[format].extension}`;
}

export function reportToCsv(doc: ReportDocument): string {
  return `﻿${toCsv(documentToRows(doc))}`;
}

const NUMBER_FORMATS: Record<string, string> = { money: "#,##0.00", number: "#,##0.##", percent: '0.0"%"' };

export async function reportToXlsx(doc: ReportDocument, hotelName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = hotelName;
  wb.created = new Date();
  const used = new Set<string>();
  const sheetName = (title: string, i: number) => {
    let name = title.replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || `Sheet ${i + 1}`;
    while (used.has(name.toLowerCase())) name = `${name.slice(0, 25)} ${i + 1}`;
    used.add(name.toLowerCase());
    return name;
  };
  const sections: ReportSection[] = doc.sections.length ? doc.sections : [{ columns: [], rows: [] }];

  sections.forEach((section, i) => {
    const ws = wb.addWorksheet(sheetName(section.title || doc.title, i));
    const span = Math.max(section.columns.length, 1);
    ws.addRow([hotelName]).font = { bold: true, size: 14 };
    ws.addRow([doc.title]).font = { bold: true };
    ws.addRow([section.title || doc.subtitle]);
    ws.addRow([]);
    if (section.rows.length === 0) {
      ws.addRow([section.emptyMessage || "Nothing to show for this period."]);
    } else {
      const header = ws.addRow(section.columns.map((c) => c.label));
      header.font = { bold: true };
      header.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      });
      const write = (row: Record<string, ReportCell>, bold: boolean) => {
        const r = ws.addRow(section.columns.map((c) => cellValue(row[c.key]) ?? ""));
        section.columns.forEach((c, idx) => {
          const kind = cellKind(row[c.key], c);
          const v = cellValue(row[c.key]);
          const cell = r.getCell(idx + 1);
          if (typeof v === "number" && NUMBER_FORMATS[kind]) cell.numFmt = NUMBER_FORMATS[kind];
          if (typeof v === "number") cell.alignment = { horizontal: "right" };
        });
        if (bold) r.font = { bold: true };
      };
      for (const row of section.rows) write(row, false);
      if (section.totals) write(section.totals, true);
      ws.views = [{ state: "frozen", ySplit: 5 }];
    }
    ws.addRow([]);
    if (i === sections.length - 1) for (const n of doc.notes) ws.addRow([n]).font = { italic: true, color: { argb: "FF475569" } };
    ws.columns.forEach((col, idx) => {
      let width = 12;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        if (cell.fullAddress.row > 5 || idx >= span) width = Math.max(width, Math.min(44, String(cell.value ?? "").length + 2));
      });
      col.width = idx < span ? width : 12;
    });
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ---------- PDF ---------- */

const FONT_DIR = path.join(process.cwd(), "src", "assets", "fonts");
let fontBytes: Promise<[Uint8Array, Uint8Array] | null> | null = null;

function loadFonts() {
  fontBytes ??= Promise.all([readFile(path.join(FONT_DIR, "NotoSans-Regular.ttf")), readFile(path.join(FONT_DIR, "NotoSans-Bold.ttf"))])
    .then(([a, b]) => [new Uint8Array(a), new Uint8Array(b)] as [Uint8Array, Uint8Array])
    .catch(() => {
      fontBytes = null;
      return null;
    });
  return fontBytes;
}

const PAGE = { width: 841.89, height: 595.28 };
const MARGIN = 36;
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.28, 0.33, 0.41);
const RULE = rgb(0.8, 0.84, 0.88);
const HEAD = rgb(0.89, 0.91, 0.94);
const SIZE = 8.5;
const LEADING = 11.5;

/** A landscape A4 PDF: a title block, each section as a table that continues across pages, then the notes. */
export async function reportToPdf(doc: ReportDocument, hotelName: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.title} · ${doc.subtitle}`);
  pdf.setAuthor(hotelName);
  pdf.setLanguage("en-GB");
  let font: PDFFont;
  let bold: PDFFont;
  const noto = await loadFonts();
  try {
    if (!noto) throw new Error("no font");
    pdf.registerFontkit(fontkit);
    [font, bold] = await Promise.all([pdf.embedFont(noto[0], { subset: true }), pdf.embedFont(noto[1], { subset: true })]);
  } catch {
    [font, bold] = await Promise.all([pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold)]);
  }
  const supported = new Set(font.getCharacterSet());
  const t = (s: string) => toPdfText(s, supported);
  const w = (f: PDFFont, s: string, size = SIZE) => f.widthOfTextAtSize(s, size);

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;
  const usable = PAGE.width - MARGIN * 2;
  const newPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
  };
  const need = (h: number) => {
    if (y - h < MARGIN + 14) newPage();
  };

  page.drawText(t(hotelName), { x: MARGIN, y: y - 14, size: 14, font: bold, color: INK });
  y -= 30;
  page.drawText(t(doc.title), { x: MARGIN, y: y - 10, size: 11, font: bold, color: INK });
  y -= 16;
  page.drawText(t(doc.subtitle), { x: MARGIN, y: y - 9, size: 9, font, color: MUTED });
  y -= 22;

  const widthsFor = (cols: ReportColumn[], cellsText: string[][]) => {
    const natural = cols.map((c, i) => Math.max(w(bold, t(c.label)), ...cellsText.map((r) => w(font, r[i] ?? ""))) + 12);
    const total = natural.reduce((a, b) => a + b, 0);
    if (total <= usable) {
      const extra = (usable - total) / cols.length;
      return natural.map((n) => n + extra);
    }
    // Too wide: share the room in proportion, with a floor so narrow columns stay readable.
    const min = cols.map((_, i) => Math.min(natural[i], 60));
    let widths = natural.map((n) => (n / total) * usable);
    widths = widths.map((n, i) => Math.max(n, min[i]));
    const scale = usable / widths.reduce((a, b) => a + b, 0);
    return widths.map((n) => n * scale);
  };

  for (const section of doc.sections) {
    if (section.title) {
      need(34);
      page.drawText(t(section.title), { x: MARGIN, y: y - 10, size: 10, font: bold, color: INK });
      y -= 18;
    }
    if (section.rows.length === 0) {
      need(20);
      page.drawText(t(section.emptyMessage ?? "Nothing to show for this period."), { x: MARGIN, y: y - 9, size: 9, font, color: MUTED });
      y -= 24;
      continue;
    }
    const cols = section.columns;
    const body = [...section.rows, ...(section.totals ? [section.totals] : [])];
    const text = body.map((r) => cols.map((c) => t(formatCell(r[c.key], c, doc.currency))));
    const widths = widthsFor(cols, text);
    const right = (c: ReportColumn, r: Record<string, ReportCell>) => typeof cellValue(r[c.key]) === "number";

    const header = () => {
      need(LEADING + 8);
      page.drawRectangle({ x: MARGIN, y: y - LEADING - 3, width: usable, height: LEADING + 4, color: HEAD });
      let x = MARGIN;
      cols.forEach((c, i) => {
        const label = t(c.label);
        const numeric = c.kind === "money" || c.kind === "number" || c.kind === "percent";
        const tx = numeric ? x + widths[i] - 6 - w(bold, label) : x + 6;
        page.drawText(label, { x: tx, y: y - LEADING + 1, size: SIZE, font: bold, color: INK });
        x += widths[i];
      });
      y -= LEADING + 6;
    };
    header();

    body.forEach((row, ri) => {
      const isTotal = section.totals != null && ri === body.length - 1;
      const f = isTotal ? bold : font;
      const wrapped = cols.map((c, i) => wrapText(text[ri][i], widths[i] - 12, (s) => w(f, s)));
      const lines = Math.max(...wrapped.map((l) => l.length));
      const h = lines * LEADING + 4;
      if (y - h < MARGIN + 14) {
        newPage();
        header();
      }
      let x = MARGIN;
      cols.forEach((c, i) => {
        const numeric = right(c, row);
        wrapped[i].forEach((line, li) => {
          const tx = numeric ? x + widths[i] - 6 - w(f, line) : x + 6;
          page.drawText(line, { x: tx, y: y - LEADING + 2 - li * LEADING, size: SIZE, font: f, color: INK });
        });
        x += widths[i];
      });
      y -= h;
      page.drawLine({ start: { x: MARGIN, y: y + 1 }, end: { x: MARGIN + usable, y: y + 1 }, thickness: 0.4, color: RULE });
    });
    y -= 16;
  }

  for (const note of doc.notes) {
    const lines = wrapText(t(note), usable, (s) => w(font, s, 8));
    need(lines.length * 10 + 4);
    lines.forEach((line, i) => page.drawText(line, { x: MARGIN, y: y - 8 - i * 10, size: 8, font, color: MUTED }));
    y -= lines.length * 10 + 4;
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = t(`${hotelName} · Page ${i + 1} of ${pages.length}`);
    p.drawText(label, { x: PAGE.width - MARGIN - w(font, label, 8), y: 20, size: 8, font, color: MUTED });
  });
  return Buffer.from(await pdf.save());
}

export async function buildReportFile(doc: ReportDocument, format: ReportFileFormat, hotelName: string): Promise<Buffer> {
  if (format === "xlsx") return reportToXlsx(doc, hotelName);
  if (format === "pdf") return reportToPdf(doc, hotelName);
  return Buffer.from(reportToCsv(doc), "utf8");
}
