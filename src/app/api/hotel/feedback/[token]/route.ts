import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cleanRating, loadFeedbackForm, submitStayFeedback, verifyFeedbackToken } from "@/lib/hms/stay-feedback";
import { emitNotification } from "@/lib/hms/front-desk-ops";
import { isLowScore } from "@/lib/hms/stay-feedback-shared";

/*
 * The guest's feedback form. No sign-in: the signed link names the stay and runs out after 60 days.
 */

const Rating = z.preprocess((v) => cleanRating(v), z.number().int().min(1).max(5).nullable());

const AnswerSchema = z.object({
  overall: Rating.refine((v) => v !== null, "Please rate your stay."),
  cleanliness: Rating.optional().default(null),
  staff: Rating.optional().default(null),
  value: Rating.optional().default(null),
  wouldRecommend: z.boolean().nullable().optional().default(null),
  comment: z.string().trim().max(1500).nullable().optional().default(null),
});

const EXPIRED = { error: "This link has expired or isn't right. Ask the hotel to send it again." };
const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const stay = verifyFeedbackToken(token);
  if (!stay) return NextResponse.json(EXPIRED, { status: 404, headers: NO_STORE });
  const form = await loadFeedbackForm(createServerSupabaseClient(), stay.tenantId, stay.reservationId);
  if (!form) return NextResponse.json(EXPIRED, { status: 404, headers: NO_STORE });
  return NextResponse.json(form, { headers: NO_STORE });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const stay = verifyFeedbackToken(token);
    if (!stay) return NextResponse.json(EXPIRED, { status: 404, headers: NO_STORE });
    const a = AnswerSchema.parse(await req.json());

    const db = createServerSupabaseClient();
    const saved = await submitStayFeedback(db, {
      tenantId: stay.tenantId,
      reservationId: stay.reservationId,
      answers: {
        overall: a.overall as number,
        cleanliness: a.cleanliness,
        staff: a.staff,
        value: a.value,
        wouldRecommend: a.wouldRecommend,
        comment: a.comment || null,
      },
    });
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 409, headers: NO_STORE });

    // A poor score is something a manager should follow up while the guest still remembers.
    if (isLowScore({ overall: a.overall as number, submittedAt: "now" })) {
      await emitNotification({
        tenantId: stay.tenantId,
        type: "low_feedback_score",
        title: "Low guest feedback",
        body: `${saved.guestName}${saved.roomCode ? ` (Room ${saved.roomCode})` : ""} rated their stay ${a.overall} out of 5.`,
        severity: "warning",
        entityType: "reservation",
        entityId: stay.reservationId,
        department: "management",
      });
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Check your answers." }, { status: 400, headers: NO_STORE });
    console.error("[feedback POST]", e);
    return NextResponse.json({ error: "Could not save your feedback." }, { status: 500, headers: NO_STORE });
  }
}
