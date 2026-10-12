import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import type { CustomFontFormat } from "@/lib/store/site/fonts";

const BUCKET = "store-products";
const MAX_BYTES = 2 * 1024 * 1024;

/** Font files are recognised by their first bytes, not the name, so a renamed file of another kind is refused. */
function detectFormat(head: Uint8Array): { format: CustomFontFormat; ext: string; type: string } | null {
  const tag = String.fromCharCode(...head.slice(0, 4));
  if (tag === "wOF2") return { format: "woff2", ext: "woff2", type: "font/woff2" };
  if (tag === "wOFF") return { format: "woff", ext: "woff", type: "font/woff" };
  if (tag === "OTTO") return { format: "opentype", ext: "otf", type: "font/otf" };
  if (tag === "true" || (head[0] === 0 && head[1] === 1 && head[2] === 0 && head[3] === 0)) return { format: "truetype", ext: "ttf", type: "font/ttf" };
  return null;
}

/** POST /api/store/fonts/upload (form: slug, file) — owner or admin. Stores a font file for the shop. */
export async function POST(req: Request) {
  const form = await req.formData();
  const resolved = await resolveStoreRequest(String(form.get("slug") || ""));
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) {
    return NextResponse.json({ error: "Only the owner or an admin can change the shop's fonts." }, { status: 403 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a font file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Font files must be 2MB or less." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectFormat(bytes);
  if (!kind) return NextResponse.json({ error: "That isn't a font file we can use. Upload a .woff2, .woff, .ttf or .otf file." }, { status: 400 });

  const path = `${resolved.access.tenantId}/fonts/${randomUUID()}.${kind.ext}`;
  const { error } = await resolved.service.storage.from(BUCKET).upload(path, bytes, { contentType: kind.type, upsert: false, cacheControl: "31536000" });
  if (error) return NextResponse.json({ error: "We couldn't upload that font. Please try again." }, { status: 500 });

  const { data } = resolved.service.storage.from(BUCKET).getPublicUrl(path);
  const label = file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "My font";
  return NextResponse.json({ url: data.publicUrl, format: kind.format, label });
}
