import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";

const BUCKET = "store-products";
const MAX_BYTES = 10 * 1024 * 1024;
const DOCUMENT_TYPES = new Set(["certificate", "safety_data_sheet", "manual", "other"]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;

  const { data, error } = await result.service
    .schema("store")
    .from("product_documents")
    .select("*")
    .eq("product_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ documents: data || [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await req.formData();
  const slug = String(formData.get("slug") || "");
  const label = String(formData.get("label") || "");
  const documentType = String(formData.get("document_type") || "other");
  const file = formData.get("file");

  const result = await resolveStoreRequest(slug);
  if (result.error) return result.error;

  if (!label) return NextResponse.json({ error: "Missing label." }, { status: 400 });
  if (!DOCUMENT_TYPES.has(documentType)) {
    return NextResponse.json({ error: "Invalid document_type." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File must be 10MB or less." }, { status: 400 });

  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  const path = `${result.access.tenantId}/documents/${randomUUID()}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await result.service.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

  const { data: publicData } = result.service.storage.from(BUCKET).getPublicUrl(path);

  const { data, error } = await result.service
    .schema("store")
    .from("product_documents")
    .insert({
      tenant_id: result.access.tenantId,
      product_id: id,
      label,
      document_type: documentType,
      file_url: publicData.publicUrl,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ document: data }, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId") || "";
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!itemId) return NextResponse.json({ error: "Missing itemId." }, { status: 400 });

  const { error } = await result.service.schema("store").from("product_documents").delete().eq("id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
