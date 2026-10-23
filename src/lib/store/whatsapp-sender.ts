import { EMAIL_SITE_URL } from "@/lib/mail/layout";
import type { WhatsAppTemplate } from "./whatsapp-templates";

/*
 * Sends WhatsApp messages from XYVOO's own number through Meta's WhatsApp
 * Cloud API. Two modes, chosen by WHATSAPP_MODE:
 *
 *   log    (the default) nothing leaves XYVOO: each message is only written
 *          to store.whatsapp_messages, where the shop's message log shows it.
 *          For staging, and until XYVOO's number and templates are approved.
 *   cloud  sends for real. Needs WHATSAPP_PHONE_NUMBER_ID and
 *          WHATSAPP_ACCESS_TOKEN (a permanent system-user token). Meta's free
 *          test number works here too, to up to five numbers you've added in
 *          the app's WhatsApp settings.
 *
 * Optional: WHATSAPP_GRAPH_VERSION (default v23.0), WHATSAPP_TEMPLATE_LANGUAGE
 * (default "en", the language the templates were approved in),
 * WHATSAPP_DAILY_CAP (messages per shop per day, default 300).
 */

export type WhatsAppMode = "log" | "cloud";

export function whatsappMode(): WhatsAppMode {
  return process.env.WHATSAPP_MODE === "cloud" && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN ? "cloud" : "log";
}

export function whatsappDailyCap() {
  const cap = Number(process.env.WHATSAPP_DAILY_CAP);
  return Number.isFinite(cap) && cap > 0 ? cap : 300;
}

/** The full link a template's button opens, for the log and for checking templates. */
export const templateButtonUrl = (template: WhatsAppTemplate, suffix: string) => `${EMAIL_SITE_URL}${template.button.path}${suffix}`;

export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    /** Meta's error code, e.g. 131026 (not on WhatsApp) or 131047 (outside the 24-hour window). */
    readonly code: number | null,
  ) {
    super(message);
  }
}

async function graph(path: string, body: unknown) {
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string; code?: number } } | null;
  if (!res.ok || !json?.messages?.[0]?.id) {
    throw new WhatsAppSendError(json?.error?.message || `WhatsApp answered ${res.status}`, json?.error?.code ?? null);
  }
  return json.messages[0].id;
}

/** Sends an approved template. Returns Meta's message id. Throws WhatsAppSendError. */
export function sendTemplateMessage(input: { to: string; template: WhatsAppTemplate; params: string[]; buttonSuffix: string }) {
  return graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: input.template.name,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
      components: [
        { type: "body", parameters: input.params.map((text) => ({ type: "text", text })) },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: input.buttonSuffix }] },
      ],
    },
  });
}

/** A plain reply, allowed only within 24 hours of the person messaging XYVOO's number. */
export function sendTextMessage(to: string, body: string) {
  return graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body, preview_url: true },
  });
}
