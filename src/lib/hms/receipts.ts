import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { FolioLineRow } from "@/lib/hms/folio";

export function buildCheckoutReceiptEmail(params: {
  hotelName: string;
  guestName: string;
  confirmationCode: string;
  roomCode: string | null;
  folioNumber: string;
  currency: string;
  lines: FolioLineRow[];
  checkedOutAt: string;
}): { subject: string; text: string; html: string } {
  const activeLines = params.lines.filter((l) => !l.voided_at);
  const charges = activeLines.filter((l) => l.kind === "charge" || l.kind === "discount" || l.kind === "transfer");
  const payments = activeLines.filter((l) => l.kind === "payment" || l.kind === "refund");
  const totalCharges = charges.reduce((sum, l) => sum + Number(l.amount), 0);
  const totalPaid = payments.reduce((sum, l) => sum + Math.abs(Number(l.amount)), 0);
  const balance = Math.round((totalCharges - totalPaid) * 100) / 100;
  const money = (n: number) => formatPricingAmount(n, params.currency);

  const subject = `Your receipt from ${params.hotelName} — Folio ${params.folioNumber}`;

  const lineRows = (rows: FolioLineRow[]) =>
    rows
      .map(
        (l) =>
          `<tr><td style="padding:4px 0;color:#334155;">${l.description ?? l.kind}</td><td style="padding:4px 0;text-align:right;white-space:nowrap;">${money(Number(l.amount))}</td></tr>`,
      )
      .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color:#0f172a;">
      <h2 style="margin-bottom:4px;">${params.hotelName}</h2>
      <p style="color:#64748b;margin-top:0;">Checkout receipt</p>
      <p>
        <strong>${params.guestName}</strong><br/>
        Confirmation ${params.confirmationCode}${params.roomCode ? ` · Room ${params.roomCode}` : ""}<br/>
        Folio ${params.folioNumber}<br/>
        Checked out ${new Date(params.checkedOutAt).toLocaleString()}
      </p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;">
        <thead>
          <tr style="border-bottom:1px solid #e2e8f0;text-align:left;">
            <th style="padding:6px 0;font-size:12px;text-transform:uppercase;color:#64748b;">Charges</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${lineRows(charges)}</tbody>
      </table>
      ${
        payments.length > 0
          ? `<table style="width:100%;border-collapse:collapse;margin-top:12px;">
              <thead>
                <tr style="border-bottom:1px solid #e2e8f0;text-align:left;">
                  <th style="padding:6px 0;font-size:12px;text-transform:uppercase;color:#64748b;">Payments</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${lineRows(payments)}</tbody>
            </table>`
          : ""
      }
      <table style="width:100%;border-collapse:collapse;margin-top:16px;border-top:2px solid #0f172a;">
        <tbody>
          <tr><td style="padding:6px 0;font-weight:600;">Total charges</td><td style="padding:6px 0;text-align:right;">${money(totalCharges)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:600;">Total paid</td><td style="padding:6px 0;text-align:right;">${money(totalPaid)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Balance</td><td style="padding:6px 0;text-align:right;font-weight:700;">${money(balance)}</td></tr>
        </tbody>
      </table>
      <p style="margin-top:20px;color:#94a3b8;font-size:12px;">Thank you for staying with ${params.hotelName}.</p>
    </div>
  `;

  const text = [
    `${params.hotelName} — Checkout receipt`,
    `${params.guestName} · Confirmation ${params.confirmationCode}${params.roomCode ? ` · Room ${params.roomCode}` : ""}`,
    `Folio ${params.folioNumber} · Checked out ${new Date(params.checkedOutAt).toLocaleString()}`,
    "",
    "Charges:",
    ...charges.map((l) => `  ${l.description ?? l.kind}: ${money(Number(l.amount))}`),
    ...(payments.length ? ["", "Payments:", ...payments.map((l) => `  ${l.description ?? l.kind}: ${money(Number(l.amount))}`)] : []),
    "",
    `Total charges: ${money(totalCharges)}`,
    `Total paid: ${money(totalPaid)}`,
    `Balance: ${money(balance)}`,
  ].join("\n");

  return { subject, text, html };
}
