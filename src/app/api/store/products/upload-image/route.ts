import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStoreAccessContext } from "@/lib/store/access";

const BUCKET = "store-products";
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const formData = await req.formData();
  const slug = String(formData.get("slug") || "");
  const file = formData.get("file");

  if (!slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });

  const access = await getStoreAccessContext(slug);
  if (!access.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!access.tenantId || !access.role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing image file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 5MB or less." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image." }, { status: 400 });
  }

  const service = createServerSupabaseClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${access.tenantId}/${randomUUID()}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await service.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message || "Failed to upload image." }, { status: 400 });
  }

  const { data: publicData } = service.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: publicData.publicUrl });
}
