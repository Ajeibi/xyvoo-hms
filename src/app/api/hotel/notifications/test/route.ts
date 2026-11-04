import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { sendTestAlert } from "@/lib/hms/alert-delivery";

/** "Send me a test": one message to the signed-in person on one channel. Nothing is saved as an alert. */
const Schema = z.object({ slug: z.string().min(1), channel: z.enum(["email", "whatsapp", "push"]) });

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const outcome = await sendTestAlert(auth.service, auth.tenant.id, auth.user.id, body.channel);
    return NextResponse.json(outcome);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
