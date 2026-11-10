import { NextResponse, after } from "next/server";
import { z } from "zod";
import { rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { kioskState } from "@/lib/hms/hr/hr-kiosk";
import { decodeClockPhoto, hrFilePath, uploadHrFile } from "@/lib/hms/hr/hr-files";
import { alertMissingStaff, clock, employeeByPin, tenantForKiosk } from "@/lib/hms/hr/hr-time";
import { cancelLeave, requestLeave } from "@/lib/hms/hr/hr-leave";
import { acceptSwap, cancelSwap, offerShift, pickUpShift, requestSwap } from "@/lib/hms/hr/hr-swaps";

/*
 * The staff clock screen. No login: the link itself is the key (the manager can change it in HR
 * settings), and each person proves who they are with their PIN on every action. PIN guesses are
 * limited per link and per device.
 */

const CLOCK = ["clock_in", "clock_out", "break_start", "break_end"] as const;

const Body = z.object({
  pin: z.string().regex(/^\d{4,6}$/),
  action: z.enum(["identify", ...CLOCK, "offer", "swap", "pick_up", "accept", "cancel_swap", "leave_request", "leave_cancel"]),
  shiftId: z.string().uuid().optional(),
  otherShiftId: z.string().uuid().optional(),
  toEmployeeId: z.string().uuid().nullable().optional(),
  swapId: z.string().uuid().optional(),
  note: z.string().max(300).nullable().optional(),
  leaveTypeId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  leaveId: z.string().uuid().optional(),
  /** A small JPEG from the tablet camera, when the hotel takes photos at clock-in and clock-out. */
  photo: z.string().max(600_000).optional(),
});

/** Checks for staff who haven't clocked in, at most every 5 minutes per hotel, after the reply has gone. */
function checkLateStaff(tenantId: string) {
  after(async () => {
    const gate = await rateLimitShared(`hr-late-check:${tenantId}`, 1, 5 * 60_000);
    if (!gate.ok) return;
    await alertMissingStaff(createServerSupabaseClient(), tenantId).catch((e) => console.warn("[hr late check]", e));
  });
}

function clientKey(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const service = createServerSupabaseClient();
  const kiosk = await tenantForKiosk(service, token);
  if (!kiosk) return NextResponse.json({ error: "This clock screen link isn't working. Ask a manager for the new one." }, { status: 404 });

  const limit = await rateLimitShared(`hr-kiosk:${token.slice(0, 12)}:${clientKey(req)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: `Too many tries. Wait ${limit.retryAfterSeconds} seconds.` }, { status: 429 });

  checkLateStaff(kiosk.tenantId);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type your 4 to 6 number PIN." }, { status: 400 });
  const employee = await employeeByPin(service, kiosk.tenantId, parsed.data.pin);
  if (!employee) return NextResponse.json({ error: "That PIN isn't right. Try again, or ask a manager." }, { status: 401 });

  const b = parsed.data;
  const t = kiosk.tenantId;
  let message = "";
  let result: { error: string | null } = { error: null };
  if ((CLOCK as readonly string[]).includes(b.action)) {
    const r = await clock(service, t, employee, b.action as (typeof CLOCK)[number]);
    result = r;
    message = r.message;
    if (!r.error && r.entryId && kiosk.photo && (b.action === "clock_in" || b.action === "clock_out")) {
      // The clock-in stands even if the photo is missing or fails; the Time page shows it has none.
      const photo = b.photo ? decodeClockPhoto(b.photo) : null;
      if (photo) {
        const path = hrFilePath(t, `clock/${new Date().toISOString().slice(0, 7)}`, photo.type);
        const up = await uploadHrFile(service, path, photo.bytes, photo.type);
        if (!up.error) {
          await service
            .schema("hotel")
            .from("hr_time_entries")
            .update(b.action === "clock_in" ? { clock_in_photo_path: path } : { clock_out_photo_path: path })
            .eq("tenant_id", t)
            .eq("id", r.entryId);
        }
      }
    }
  } else if (b.action !== "identify") {
    if (!kiosk.selfService) return NextResponse.json({ error: "The hotel has switched off requests on the clock screen. Ask a manager." }, { status: 403 });
    switch (b.action) {
      case "offer":
        result = b.shiftId ? await offerShift(service, t, employee, b.shiftId, b.toEmployeeId ?? null, b.note ?? null) : { error: "Pick a shift." };
        message = "Shift offered. Your colleague needs to accept, then a manager approves.";
        break;
      case "swap":
        result = b.shiftId && b.otherShiftId ? await requestSwap(service, t, employee, b.shiftId, b.otherShiftId, b.note ?? null) : { error: "Pick both shifts." };
        message = "Swap asked for. Your colleague needs to accept, then a manager approves.";
        break;
      case "pick_up":
        result = b.shiftId ? await pickUpShift(service, t, employee, b.shiftId) : { error: "Pick a shift." };
        message = "Asked for the shift. A manager will approve it.";
        break;
      case "accept":
        result = b.swapId ? await acceptSwap(service, t, employee, b.swapId) : { error: "Pick a request." };
        message = "Accepted. A manager will approve it.";
        break;
      case "cancel_swap":
        result = b.swapId ? await cancelSwap(service, t, employee, b.swapId) : { error: "Pick a request." };
        message = "Done.";
        break;
      case "leave_request":
        result =
          b.leaveTypeId && b.startDate && b.endDate
            ? await requestLeave(service, t, employee, { employeeId: employee.id, leaveTypeId: b.leaveTypeId, startDate: b.startDate, endDate: b.endDate, reason: b.note ?? null }, "kiosk", null)
            : { error: "Choose the type of leave and the dates." };
        message = "Leave asked for. You'll see here when a manager decides.";
        break;
      case "leave_cancel":
        result = b.leaveId ? await cancelLeave(service, t, b.leaveId, { employeeId: employee.id }) : { error: "Pick a request." };
        message = "Leave cancelled.";
        break;
    }
  }
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  const state = await kioskState(service, t, employee, kiosk.selfService);
  return NextResponse.json({ message, state, selfService: kiosk.selfService, photo: kiosk.photo }, { headers: { "Cache-Control": "no-store" } });
}
