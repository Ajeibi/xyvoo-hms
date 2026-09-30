/**
 * Branded HTML layout for XYVOO emails.
 *
 * Email clients ignore most modern CSS, so this is table-based with inline styles and a
 * 600px column. The logo is the site's own public/images/xyvoo-logo.png, embedded in the
 * email as an inline attachment (see `logoAttachment`), so it shows even in clients that
 * block remote images and doesn't depend on the live site being up.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

const BRAND = {
  blue: "#007edf",
  navy: "#000d1f",
  mint: "#82f3e5",
  text: "#1e293b",
  muted: "#64748b",
  border: "#e2e8f0",
  canvas: "#f1f5f9",
  panel: "#f8fafc",
} as const;

const FONT = "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

export const EMAIL_SITE_URL = (() => {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return configured && !/localhost|127\.0\.0\.1/.test(configured) ? configured : "https://www.getxyvoo.com";
})();

const LOGO_CID = "xyvoo-logo@getxyvoo.com";

/**
 * Inline attachment for the logo referenced by `renderEmail`. Every email built with
 * `renderEmail` must be sent with this in `attachments`. Reads the file from public/ and
 * falls back to the live site's copy if the file isn't bundled with the server.
 */
export function logoAttachment() {
  const local = join(process.cwd(), "public/images/xyvoo-logo.png");
  return {
    filename: "xyvoo-logo.png",
    path: existsSync(local) ? local : `${EMAIL_SITE_URL}/images/xyvoo-logo.png`,
    cid: LOGO_CID,
    contentDisposition: "inline" as const,
  };
}

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export type BadgeTone = "blue" | "green" | "amber" | "orange" | "red";

const BADGE_COLOURS: Record<BadgeTone, { bg: string; fg: string }> = {
  blue: { bg: "#e6f2fc", fg: "#005fa8" },
  green: { bg: "#dcfce7", fg: "#166534" },
  amber: { bg: "#fef3c7", fg: "#92400e" },
  orange: { bg: "#ffedd5", fg: "#9a3412" },
  red: { bg: "#fee2e2", fg: "#991b1b" },
};

export function badge(label: string, tone: BadgeTone = "blue") {
  const c = BADGE_COLOURS[tone];
  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${c.bg};color:${c.fg};font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase">${escapeHtml(label)}</span>`;
}

/** Label/value rows in a soft panel. Values are escaped; pass `href` to make one a link. */
export function detailsPanel(rows: ReadonlyArray<{ label: string; value: string; href?: string }>) {
  const body = rows
    .map(({ label, value, href }, i) => {
      const cell = href
        ? `<a href="${escapeHtml(href)}" style="color:${BRAND.blue};text-decoration:none">${escapeHtml(value)}</a>`
        : escapeHtml(value);
      const border = i === rows.length - 1 ? "" : `border-bottom:1px solid ${BRAND.border};`;
      return `<tr>
        <td style="padding:12px 16px;${border}width:38%;color:${BRAND.muted};font-size:13px;vertical-align:top">${escapeHtml(label)}</td>
        <td style="padding:12px 16px;${border}color:${BRAND.text};font-size:14px;font-weight:600;vertical-align:top">${cell}</td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${BRAND.panel};border:1px solid ${BRAND.border};border-radius:12px">${body}</table>`;
}

/** A quoted block of free text, e.g. the visitor's message. */
export function quoteBlock(heading: string, text: string) {
  return `<p style="margin:28px 0 8px;color:${BRAND.navy};font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">${escapeHtml(heading)}</p>
    <div style="border-left:4px solid ${BRAND.blue};background:#ffffff;padding:4px 0 4px 16px;color:${BRAND.text};font-size:15px;line-height:1.65;white-space:pre-wrap">${escapeHtml(text)}</div>`;
}

export type EmailButton = { label: string; href: string; variant?: "primary" | "secondary" };

function buttons(list: ReadonlyArray<EmailButton>) {
  const cells = list
    .map(({ label, href, variant = "primary" }) => {
      const primary = variant === "primary";
      return `<td style="padding:0 12px 12px 0">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;${
          primary ? `background:${BRAND.blue};color:#ffffff;border:1px solid ${BRAND.blue}` : `background:#ffffff;color:${BRAND.navy};border:1px solid ${BRAND.border}`
        }">${escapeHtml(label)}</a>
      </td>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px"><tr>${cells}</tr></table>`;
}

export type EmailLayout = {
  /** Inbox preview text shown after the subject line. */
  preheader: string;
  /** Small badges above the title, already rendered with `badge()`. */
  badges?: string[];
  title: string;
  /** Plain-text intro paragraph (escaped). */
  intro?: string;
  /** Trusted HTML built from the helpers above. */
  body?: string;
  buttons?: EmailButton[];
  /** Small grey line under the buttons, e.g. a reference and timestamp (escaped). */
  meta?: string;
  /** Why the reader got this email (escaped). */
  footerNote: string;
};

export function renderEmail(layout: EmailLayout) {
  const year = new Date().getFullYear();
  const siteHost = EMAIL_SITE_URL.replace(/^https?:\/\//, "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(layout.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};font-family:${FONT};-webkit-font-smoothing:antialiased">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(layout.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.canvas}" style="background:${BRAND.canvas}">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border}">
          <tr>
            <td height="6" bgcolor="${BRAND.blue}" style="height:6px;line-height:6px;font-size:0;background:${BRAND.blue};background-image:linear-gradient(90deg,${BRAND.blue},${BRAND.mint})">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 32px 20px;border-bottom:1px solid ${BRAND.border}">
              <a href="${EMAIL_SITE_URL}" style="text-decoration:none">
                <img src="cid:${LOGO_CID}" width="150" height="60" alt="XYVOO" style="display:block;width:150px;height:auto;border:0;outline:none">
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 36px;color:${BRAND.text}">
              ${layout.badges?.length ? `<div style="margin-bottom:14px">${layout.badges.join("&nbsp;")}</div>` : ""}
              <h1 style="margin:0;color:${BRAND.navy};font-size:24px;line-height:1.3;font-weight:800">${escapeHtml(layout.title)}</h1>
              ${layout.intro ? `<p style="margin:12px 0 24px;color:${BRAND.muted};font-size:15px;line-height:1.6">${escapeHtml(layout.intro)}</p>` : `<div style="height:20px"></div>`}
              ${layout.body ?? ""}
              ${layout.buttons?.length ? buttons(layout.buttons) : ""}
              ${layout.meta ? `<p style="margin:20px 0 0;color:${BRAND.muted};font-size:12px">${escapeHtml(layout.meta)}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td bgcolor="${BRAND.navy}" style="background:${BRAND.navy};padding:24px 32px;color:#cbd5e1;font-size:12px;line-height:1.6">
              <p style="margin:0 0 10px">
                <a href="${EMAIL_SITE_URL}" style="color:#ffffff;font-weight:700;text-decoration:none">${escapeHtml(siteHost)}</a>
                <span style="color:#475569">&nbsp;&middot;&nbsp;</span>
                <a href="${EMAIL_SITE_URL}/support" style="color:${BRAND.mint};text-decoration:none">Help centre</a>
                <span style="color:#475569">&nbsp;&middot;&nbsp;</span>
                <a href="mailto:support@getxyvoo.com" style="color:${BRAND.mint};text-decoration:none">support@getxyvoo.com</a>
              </p>
              <p style="margin:0 0 6px;color:#94a3b8">${escapeHtml(layout.footerNote)}</p>
              <p style="margin:0;color:#64748b">&copy; ${year} XYVOO Technologies Ltd</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
