import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { insertFolioLine } from "@/lib/hms/folio";
import { DEPOSIT_RESERVATION_COLUMNS, getDepositState, type DepositReservation } from "@/lib/hms/folio-deposits";
import { settleDeposit } from "@/lib/hms/folio-refunds";
import { matchWaitlistForOpening } from "@/lib/hms/waitlist";
import { addDaysToDate, zonedDayBounds } from "@/lib/hms/business-date";
import type { NoShowMode } from "@/lib/hms/night-audit-settings";

/*
 * Guests who were due on or before the audit date and never arrived. The audit marks the booking
 * a no-show, frees the room, keeps any deposit the guest paid (as a cancellation fee) and, under
 * the "policy" rule, charges what the deposit policy asked for and wasn't paid.
 */

export type NoShowOutcome = {
  reservationId: string;
  confirmationCode: string;
  keptDeposit: number;
  fee: number;
  error?: string;
};

type NoShowReservation = DepositReservation & {
  confirmation_code: string;
  departure_at: string;
  room_unit_id: string | null;
};

const COLUMNS = `${DEPOSIT_RESERVATION_COLUMNS},confirmation_code,departure_at,room_unit_id`;

/** What the no-show fee is: the deposit the policy asked for, less what the guest already paid. Pure. */
export function noShowFee(mode: NoShowMode, required: number, paid: number): number {
  if (mode !== "policy") return 0;
  return Math.max(0, Math.round((required - paid) * 100) / 100);
}

/** Bookings due longer ago than this are left for staff: old data, not tonight's no-shows. */
export const NO_SHOW_WINDOW_DAYS = 2;

/** Bookings still marked as arriving, split into tonight's no-shows and older ones left for staff. */
export function splitNoShows<T extends { arrival_at: string }>(rows: T[], auditDate: string) {
  const oldest = addDaysToDate(auditDate, -NO_SHOW_WINDOW_DAYS);
  const due = rows.filter((r) => r.arrival_at.slice(0, 10) <= auditDate);
  return { recent: due.filter((r) => r.arrival_at.slice(0, 10) >= oldest), stale: due.filter((r) => r.arrival_at.slice(0, 10) < oldest) };
}

export async function listNoShows(service: SupabaseClient, tenantId: string, auditDate: string) {
  const { data } = await service
    .schema("hotel")
    .from("reservations")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("status", "confirmed")
    .lt("arrival_at", `${addDaysToDate(auditDate, 1)}T00:00:00Z`)
    .order("arrival_at", { ascending: false })
    .limit(200);
  return splitNoShows((data ?? []) as unknown as NoShowReservation[], auditDate).recent;
}

export async function processNoShows(
  service: SupabaseClient,
  params: { tenantId: string; auditDate: string; mode: NoShowMode; userId: string; currency: string; timeZone: string; automatic: boolean },
): Promise<NoShowOutcome[]> {
  const out: NoShowOutcome[] = [];
  for (const r of await listNoShows(service, params.tenantId, params.auditDate)) {
    const outcome: NoShowOutcome = { reservationId: r.id, confirmationCode: r.confirmation_code, keptDeposit: 0, fee: 0 };
    try {
      // Claim it first, so two audits can't both charge the same guest.
      const { data: claimed } = await service
        .schema("hotel")
        .from("reservations")
        .update({ status: "no_show", room_unit_id: null })
        .eq("tenant_id", params.tenantId)
        .eq("id", r.id)
        .eq("status", "confirmed")
        .select("id");
      if (!claimed?.length) continue;

      if (params.mode !== "mark_only") {
        const state = await getDepositState(service, params.tenantId, r);
        for (const p of state.payments.filter((x) => x.status === "held")) {
          const kept = await settleDeposit(service, {
            tenantId: params.tenantId,
            depositId: p.id,
            action: "keep",
            reason: `No-show on ${params.auditDate}, kept by the night audit`,
            userId: params.userId,
          });
          if (kept.ok) outcome.keptDeposit += p.amount;
          else outcome.error = kept.error;
        }
        const fee = noShowFee(params.mode, state.required, state.paid);
        if (fee > 0) {
          const { line, error } = await insertFolioLine(service, {
            tenantId: params.tenantId,
            reservationId: r.id,
            kind: "charge",
            amount: fee,
            method: "system",
            description: "No-show fee (deposit policy)",
            department: "rooms",
            postedBy: params.userId,
            reference: `no_show_fee:${r.id}`,
            currencyCode: params.currency,
            metadata: { noShowFee: true, auditDate: params.auditDate },
          });
          if (error || !line) outcome.error = error ?? "The fee couldn't be posted.";
          else {
            outcome.fee = fee;
            // The fee belongs to the day being closed, not to the minute the audit ran.
            const closing = new Date(new Date(zonedDayBounds(params.auditDate, params.timeZone).end).getTime() - 1000).toISOString();
            await service.schema("hotel").from("folio_transactions").update({ created_at: closing }).eq("id", line.id);
          }
        }
      }

      await writeAuditLog({
        tenantId: params.tenantId,
        actorUserId: params.userId,
        action: params.automatic ? "no_show_night_audit_auto" : "no_show_night_audit",
        entityType: "reservation",
        entityId: r.id,
        before: { status: "confirmed", room_unit_id: r.room_unit_id },
        after: { status: "no_show", keptDeposit: outcome.keptDeposit, fee: outcome.fee, auditDate: params.auditDate },
      });

      try {
        await matchWaitlistForOpening(service, params.tenantId, { roomTypeCode: r.room_type_code, arrivalAt: r.arrival_at, departureAt: r.departure_at });
      } catch (e) {
        console.warn("[night-audit] waitlist match failed", e);
      }
    } catch (e) {
      outcome.error = e instanceof Error ? e.message : "Could not process this no-show.";
    }
    out.push(outcome);
  }
  return out;
}
