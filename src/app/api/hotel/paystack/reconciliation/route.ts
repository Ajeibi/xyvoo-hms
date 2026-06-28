import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";

const ADMIN_LIKE = new Set(["owner", "admin"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!ADMIN_LIKE.has(auth.role)) {
    return NextResponse.json({ error: "Owner or admin access required." }, { status: 403 });
  }

  let query = auth.service
    .schema("hotel")
    .from("payment_intents")
    .select(
      "id,reservation_id,amount,currency_code,purpose,paystack_reference,status,folio_transaction_id,created_at,updated_at",
    )
    .eq("tenant_id", auth.tenant.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ intents: data ?? [] });
}
