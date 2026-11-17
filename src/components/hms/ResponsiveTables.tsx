"use client";

import { useEffect } from "react";

/**
 * On phones, wide data tables become stacked cards (each cell shows its column name above its
 * value) instead of scrolling sideways. Nothing is hidden: every column stays, just stacked.
 *
 * Cells get a `data-label` copied from the matching header cell, and the table is marked
 * `data-stack`; the layout itself lives in globals.css under `table[data-stack]`.
 * Add `data-no-stack` to a table (or any parent) whose grid layout must stay, such as a calendar.
 */
/** React tags each DOM node it has hydrated; a node without the tag is still server HTML waiting for React. */
const isHydrated = (el: Element) => Object.keys(el).some((key) => key.startsWith("__reactFiber$"));

/**
 * Returns false when the table is still being hydrated (a page streamed in behind Suspense hydrates later
 * than this component). Adding attributes to server HTML React has not claimed yet makes it report a
 * hydration mismatch, so such a table is left alone and tried again shortly.
 */
function labelTable(table: HTMLTableElement): boolean {
  if (table.closest("[data-no-stack]")) return true;
  const headRows = table.tHead?.rows;
  if (!headRows || headRows.length === 0) return true;
  const lastCell = table.rows[table.rows.length - 1]?.cells[0];
  if (!isHydrated(table) || (lastCell && !isHydrated(lastCell))) return false;
  const headRow = headRows[headRows.length - 1];

  const labels: string[] = [];
  for (const cell of Array.from(headRow.cells)) {
    const span = cell.colSpan || 1;
    const text = (cell.textContent ?? "").replace(/\s+/g, " ").trim();
    for (let i = 0; i < span; i += 1) labels.push(span === 1 ? text : "");
  }
  if (!labels.some(Boolean)) return true;

  table.setAttribute("data-stack", "");
  const rows = [
    ...Array.from(table.tBodies).flatMap((body) => Array.from(body.rows)),
    ...(table.tFoot ? Array.from(table.tFoot.rows) : []),
  ];
  for (const row of rows) {
    let column = 0;
    for (const cell of Array.from(row.cells)) {
      const span = cell.colSpan || 1;
      const label = span === 1 ? labels[column] : "";
      if (label) {
        if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
      } else if (cell.hasAttribute("data-label")) {
        cell.removeAttribute("data-label");
      }
      column += span;
    }
  }
  return true;
}

/** Labels every table React has hydrated; returns true when some are still waiting. */
function labelAllTables(): boolean {
  let waiting = false;
  document.querySelectorAll("table").forEach((table) => {
    if (!labelTable(table)) waiting = true;
  });
  return waiting;
}

/** Mount once inside the hotel dashboard shell. Renders nothing. */
export function ResponsiveTables() {
  useEffect(() => {
    let frame = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const run = () => {
      // A table still being hydrated is tried again a moment later (for a few seconds at most).
      if (labelAllTables() && attempts < 40) {
        attempts += 1;
        retry = setTimeout(run, 150);
      } else {
        attempts = 0;
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      clearTimeout(retry);
      frame = requestAnimationFrame(run);
    };
    schedule();
    // Tables load, filter and re-render all the time, and dialogs open in portals.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(retry);
      observer.disconnect();
    };
  }, []);

  return null;
}
