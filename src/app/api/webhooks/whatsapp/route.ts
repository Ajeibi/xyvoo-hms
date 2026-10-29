import { after, NextResponse } from "next/server";
import { handleIncomingMessage, recordDeliveryStatus, validWhatsAppSignature } from "@/lib/store/whatsapp-inbound";

/*
 * Meta's webhook for XYVOO's WhatsApp number. Set it up in the Meta app
 * (WhatsApp, Configuration) with this URL, WHATSAPP_VERIFY_TOKEN as the verify
 * token, and subscribe to "messages". Every POST is signed with
 * WHATSAPP_APP_SECRET; unsigned or wrongly signed ones are refused.
 */

/** GET: Meta checks the URL once when the webhook is saved, and expects the challenge back. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === token) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

type WebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{ id?: string; status?: string; errors?: Array<{ code?: number; title?: string; message?: string }> }>;
        messages?: Array<{ from?: string; type?: string; text?: { body?: string }; button?: { text?: string } }>;
      };
    }>;
  }>;
};

/** POST: delivery receipts and messages people send to XYVOO's number. Answers at once; the work happens after. */
export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const raw = await req.text();
  if (!secret || !validWhatsAppSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const values = (body.entry ?? []).flatMap((e) => (e.changes ?? []).map((c) => c.value ?? {}));
  after(async () => {
    for (const value of values) {
      for (const s of value.statuses ?? []) {
        if (!s.id || !s.status) continue;
        const problem = s.errors?.[0];
        await recordDeliveryStatus(s.id, s.status, problem ? `${problem.title || problem.message || "Not delivered"}${problem.code ? ` (${problem.code})` : ""}` : null);
      }
      for (const m of value.messages ?? []) {
        const text = m.text?.body ?? m.button?.text ?? "";
        if (m.from) await handleIncomingMessage(m.from, text);
      }
    }
  });
  return NextResponse.json({ ok: true });
}
