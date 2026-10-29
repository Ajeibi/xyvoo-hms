import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { listWhatsAppMessages } from "@/lib/store/whatsapp-messages";
import { whatsappMode } from "@/lib/store/whatsapp-sender";

/** GET /api/store/whatsapp?slug= — the shop's recent WhatsApp order messages, to it and to its customers. Any member. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const messages = await listWhatsAppMessages(resolved.access.tenantId);
  return NextResponse.json({ messages, testMode: whatsappMode() === "log" });
}
