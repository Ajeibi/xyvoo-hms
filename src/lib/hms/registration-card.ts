import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadInvoiceData } from "@/lib/hms/folio-invoice";
import { SIGNATURE_BUCKET } from "@/lib/hms/online-checkin";
import { TaggedPdf, type TableCell } from "@/lib/store/receipts-pdf";
import { fetchLogo } from "@/lib/store/receipts";
import { fileSlug } from "@/lib/store/receipts-format";
import { countryName } from "@/lib/store/countries";

/*
 * The registration card: who is staying, for how long, and the guest's signature agreeing to the
 * hotel's terms. Signed on the guest's own phone before arrival, or on the desk's tablet, then kept
 * as a PDF on the stay in a private bucket and opened through a link that expires.
 */

const SIGNED_SECONDS = 10 * 60;

export const REGISTRATION_TERMS = [
  "I confirm that the details above are correct.",
  "I agree to follow the hotel's house rules and to pay for any damage I cause during my stay.",
  "I understand the hotel may keep a record of my identity as the law requires.",
  "I understand that I am responsible for the charges on my room bill until it is settled.",
];

export type RegistrationCard = {
  id: string;
  signedBy: string | null;
  signedAt: string;
  source: "online" | "desk";
  url: string | null;
};

const longDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";

type GuestEmbed = { nationality: string | null; id_type: string | null; id_number: string | null };

const ID_TYPE_LABEL: Record<string, string> = { passport: "Passport", national_id: "National ID", drivers_license: "Driver's licence" };

/** Draws the card. `signature` is a PNG; leave it out for a blank card to print and sign by hand. */
export async function buildRegistrationCardPdf(
  db: SupabaseClient,
  params: { tenantId: string; reservationId: string; signature?: Uint8Array | null; signedBy: string; signedAt: Date },
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const d = await loadInvoiceData(db, params.tenantId, params.reservationId);
  if (!d) return null;

  const { data } = await db
    .schema("hotel")
    .from("reservations")
    .select("adults,children_json,room_type_code,reservation_guests(is_primary,guests(nationality,id_type,id_number))")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.reservationId)
    .maybeSingle();
  const row = data as unknown as {
    adults: number;
    children_json: unknown;
    room_type_code: string;
    reservation_guests?: { is_primary: boolean | null; guests: GuestEmbed | GuestEmbed[] | null }[] | null;
  } | null;
  const links = row?.reservation_guests ?? [];
  const link = links.find((l) => l.is_primary) ?? links[0];
  const g = (Array.isArray(link?.guests) ? link?.guests[0] : link?.guests) ?? null;
  const children = Array.isArray(row?.children_json) ? (row?.children_json as unknown[]).length : 0;
  const nationality = g?.nationality?.trim() ? countryName(g.nationality.trim().toUpperCase()) : "";
  const idLine = g?.id_number?.trim() ? `${ID_TYPE_LABEL[g.id_type ?? ""] ?? "ID"} ${g.id_number.trim()}` : "";

  const pdf = await TaggedPdf.create({ title: `Registration card, ${d.guest.name}`, subject: `Registration card for ${d.guest.name} at ${d.hotelName}`, author: d.hotelName });

  const logo = await fetchLogo(d.logoUrl);
  let textX = pdf.left;
  const top = pdf.y;
  if (logo) {
    try {
      const image = logo.type === "png" ? await pdf.doc.embedPng(logo.bytes) : await pdf.doc.embedJpg(logo.bytes);
      const { width } = pdf.figure(image, `${d.hotelName} logo`, 48, 120);
      textX = pdf.left + width + 14;
    } catch {
      // An unreadable logo just isn't shown.
    }
  }
  const textWidth = pdf.right - textX;
  pdf.paragraph(d.hotelName, { size: 15, bold: true, x: textX, width: textWidth, after: 2 });
  for (const line of d.hotelLines) pdf.paragraph(line, { size: 9.5, muted: true, x: textX, width: textWidth, after: 1 });
  if (logo) pdf.y = Math.min(pdf.y, top - 52);
  pdf.rule(10);

  pdf.heading("Guest registration card", 1);

  const details: TableCell[][] = [
    ["Guest", { text: d.guest.name, bold: true }],
    ...(nationality ? [["Country", nationality]] : []),
    ...(idLine ? [["ID", idLine]] : []),
    ...(d.guest.phone ? [["Phone", d.guest.phone]] : []),
    ...(d.guest.email ? [["Email", d.guest.email]] : []),
    ["Booking reference", d.confirmationCode],
    ["Arrival", longDate(d.arrivalAt)],
    ["Departure", longDate(d.departureAt)],
    ["Nights", String(d.nights)],
    ["Guests", `${row?.adults ?? 1} adult${(row?.adults ?? 1) === 1 ? "" : "s"}${children ? `, ${children} child${children === 1 ? "" : "ren"}` : ""}`],
    ["Room", d.roomCode ? `${d.roomCode} (${row?.room_type_code ?? ""})`.replace(" ()", "") : (row?.room_type_code ?? "To be assigned")],
  ];
  pdf.table(
    [
      { header: "Detail", width: 150 },
      { header: "Value", width: pdf.contentWidth - 150 },
    ],
    details,
    { headerRow: false, rowHeaders: true, size: 10.5 },
  );

  pdf.heading("Terms I agree to");
  for (const term of REGISTRATION_TERMS) pdf.paragraph(`•  ${term}`, { size: 10, after: 3 });

  pdf.heading("Signature");
  if (params.signature) {
    try {
      const image = await pdf.doc.embedPng(params.signature);
      const { height } = pdf.figure(image, `Signature of ${params.signedBy}`, 70, 220);
      pdf.y -= height + 4;
    } catch {
      pdf.paragraph("(signature image could not be added)", { size: 9, muted: true });
    }
    pdf.paragraph(`Signed by ${params.signedBy} on ${params.signedAt.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" })} UTC.`, { size: 10, muted: true });
  } else {
    pdf.space(48);
    pdf.rule(2);
    pdf.paragraph("Guest signature and date", { size: 9.5, muted: true });
  }

  const bytes = await pdf.save(`Registration card · ${d.hotelName}`);
  return { bytes, filename: `${fileSlug(d.hotelName)}-registration-${d.confirmationCode.toLowerCase()}.pdf` };
}

/** Makes the card and keeps it on the stay. Returns the saved card, or why not. */
export async function createRegistrationCard(
  db: SupabaseClient,
  params: {
    tenantId: string;
    reservationId: string;
    signature: Uint8Array;
    signedBy: string;
    source: "online" | "desk";
    userId: string | null;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const signedAt = new Date();
  const built = await buildRegistrationCardPdf(db, { ...params, signedAt });
  if (!built) return { ok: false, error: "The registration card could not be made." };

  const path = `${params.tenantId}/${params.reservationId}/registration-${randomUUID()}.pdf`;
  let upload = await db.storage.from(SIGNATURE_BUCKET).upload(path, built.bytes, { contentType: "application/pdf", upsert: false });
  if (upload.error && /bucket/i.test(upload.error.message)) {
    await db.storage.createBucket(SIGNATURE_BUCKET, { public: false }).catch(() => undefined);
    upload = await db.storage.from(SIGNATURE_BUCKET).upload(path, built.bytes, { contentType: "application/pdf", upsert: false });
  }
  if (upload.error) {
    console.error("[registration card] not stored", upload.error.message);
    return { ok: false, error: "We couldn't save the card just now. Please try again." };
  }
  const { data, error } = await db
    .schema("hotel")
    .from("registration_cards")
    .insert({
      tenant_id: params.tenantId,
      reservation_id: params.reservationId,
      storage_path: path,
      signed_by: params.signedBy,
      signed_at: signedAt.toISOString(),
      source: params.source,
      created_by: params.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    await db.storage.from(SIGNATURE_BUCKET).remove([path]).catch(() => undefined);
    console.error("[registration card] not recorded", error?.message);
    return { ok: false, error: error?.code === "42P01" ? "Registration cards are not set up yet. Apply the online check-in migration." : "We couldn't save the card just now." };
  }
  return { ok: true, id: data.id as string };
}

/** The stay's cards, newest first, each with a link that works for a few minutes. Empty if the table isn't there yet. */
export async function listRegistrationCards(db: SupabaseClient, tenantId: string, reservationId: string): Promise<RegistrationCard[]> {
  const { data, error } = await db
    .schema("hotel")
    .from("registration_cards")
    .select("id,storage_path,signed_by,signed_at,source")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .order("signed_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  const paths = data.map((c) => c.storage_path as string);
  const { data: signed } = paths.length ? await db.storage.from(SIGNATURE_BUCKET).createSignedUrls(paths, SIGNED_SECONDS) : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return data.map((c) => ({
    id: c.id as string,
    signedBy: (c.signed_by as string | null) ?? null,
    signedAt: c.signed_at as string,
    source: c.source === "online" ? "online" : "desk",
    url: urlByPath.get(c.storage_path as string) ?? null,
  }));
}

/** The guest's online signature for a stay, as PNG bytes, if they signed one. */
export async function loadOnlineSignature(db: SupabaseClient, tenantId: string, reservationId: string): Promise<{ bytes: Uint8Array; signedBy: string } | null> {
  const { data } = await db
    .schema("hotel")
    .from("online_checkins")
    .select("signature_path,submitted_at")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .maybeSingle();
  const path = data?.signature_path as string | undefined;
  if (!path) return null;
  const file = await db.storage.from(SIGNATURE_BUCKET).download(path);
  if (file.error || !file.data) return null;
  const { data: stay } = await db
    .schema("hotel")
    .from("reservations")
    .select("reservation_guests(is_primary,guests(first_name,last_name))")
    .eq("tenant_id", tenantId)
    .eq("id", reservationId)
    .maybeSingle();
  const links = ((stay as { reservation_guests?: { is_primary: boolean | null; guests: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null }[] } | null)?.reservation_guests ?? []);
  const link = links.find((l) => l.is_primary) ?? links[0];
  const g = Array.isArray(link?.guests) ? link?.guests[0] : link?.guests;
  return { bytes: new Uint8Array(await file.data.arrayBuffer()), signedBy: g ? `${g.first_name} ${g.last_name}`.trim() : "Guest" };
}
