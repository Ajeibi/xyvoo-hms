import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { authHr, fail, isFailure } from "@/lib/hms/hr/hr-api";
import { attachDocumentFile, documentFileUrl } from "@/lib/hms/hr/hr-employees";
import { MAX_HR_DOCUMENT_BYTES } from "@/lib/hms/hr/hr-files";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Scans of staff documents. Both directions read the document row through the caller's own
 * client first, so only the owner and the people the owner named can upload or open a file.
 */

/** GET ?slug=&documentId= : sends the browser to a link that expires in 10 minutes. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const a = await authHr(url.searchParams.get("slug"));
  if (isFailure(a)) return a;
  const documentId = url.searchParams.get("documentId") ?? "";
  if (!UUID.test(documentId) || !UUID.test(id)) return fail("Document not found.", 404);
  const link = await documentFileUrl(a.privateDb, a.auth.service, a.auth.tenant.id, id, documentId);
  if (!link) return fail("Document not found, or you can't see staff documents.", 404);
  await writeAuditLog({ tenantId: a.auth.tenant.id, actorUserId: a.actor.userId, action: "hr.document.file_opened", entityType: "hr_employee", entityId: id, after: { documentId } });
  return NextResponse.redirect(link, { status: 303, headers: { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" } });
}

/** POST multipart (slug, documentId, file): stores or replaces the scan. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  if (!form) return fail("Choose a file to upload.");
  const a = await authHr(String(form.get("slug") ?? ""));
  if (isFailure(a)) return a;
  const documentId = String(form.get("documentId") ?? "");
  const file = form.get("file");
  if (!UUID.test(documentId) || !UUID.test(id)) return fail("Document not found.", 404);
  if (!(file instanceof File)) return fail("Choose a file to upload.");
  if (file.size > MAX_HR_DOCUMENT_BYTES) return fail("That file is too large. Keep it under 8 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const r = await attachDocumentFile(a.privateDb, a.auth.service, a.auth.tenant.id, id, documentId, { bytes, name: file.name }, a.actor);
  if (r.error) return fail(r.error);
  return NextResponse.json({ ok: true });
}
