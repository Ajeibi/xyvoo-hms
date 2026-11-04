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
function labelTable(table: HTMLTableElement) {
  if (table.closest("[data-no-stack]")) return;
  const headRows = table.tHead?.rows;
  if (!headRows || headRows.length === 0) return;
  const headRow = headRows[headRows.length - 1];

  const labels: string[] = [];
  for (const cell of Array.from(headRow.cells)) {
    const span = cell.colSpan || 1;
    const text = (cell.textContent ?? "").replace(/\s+/g, " ").trim();
    for (let i = 0; i < span; i += 1) labels.push(span === 1 ? text : "");
  }
  if (!labels.some(Boolean)) return;

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
}

function labelAllTables() {
  document.querySelectorAll("table").forEach(labelTable);
}

/** Mount once inside the hotel dashboard shell. Renders nothing. */
export function ResponsiveTables() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(labelAllTables);
    };
    labelAllTables();
    // Tables load, filter and re-render all the time, and dialogs open in portals.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return null;
}
