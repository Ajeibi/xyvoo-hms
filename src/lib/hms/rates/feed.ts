import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRateBook } from "@/lib/hms/rates/book";
import { addDays, rateGrid, type GridRow } from "@/lib/hms/rates/pricing";
import { freeOnNight, nightCountsForType } from "@/lib/hms/reservation-availability";

/*
 * The rate feed: for each night, room type and plan, the price, the restrictions and the rooms
 * left. It is the shape a website booking engine and a channel manager read (what the industry
 * calls ARI: availability, rates and inventory), and the rates calendar draws it.
 */

export type FeedNight = {
  date: string;
  roomTypeCode: string;
  planCode: string;
  price: number;
  /** Rooms left to sell that night (never below zero). */
  available: number;
  /** Closed by a restriction, or nothing left. */
  stopSell: boolean;
  closed: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  minStay: number | null;
  maxStay: number | null;
};

export type RateFeed = {
  currency: string;
  fromDay: string;
  days: number;
  rows: GridRow[];
  /** Rooms left per room type per night. */
  free: Record<string, Record<string, number>>;
  nights: FeedNight[];
};

export async function buildRateFeed(
  db: SupabaseClient,
  tenant: { id: string; room_types: unknown; pricing_setup: unknown },
  params: { fromDay: string; days: number; plan?: string | null; roomTypeCode?: string | null },
): Promise<RateFeed> {
  const days = Math.min(Math.max(1, Math.floor(params.days)), 120);
  const book = await loadRateBook(db, tenant, { since: params.fromDay });
  const rows = rateGrid(book, { fromDay: params.fromDay, days, planRef: params.plan, roomTypeCode: params.roomTypeCode });
  const types = book.roomTypes.filter((t) => !params.roomTypeCode || t.id === params.roomTypeCode);

  const free: RateFeed["free"] = {};
  await Promise.all(
    types.map(async (t) => {
      const counts = await nightCountsForType(db, { tenantId: tenant.id, roomTypeCode: t.id, fromDay: params.fromDay, toDay: addDays(params.fromDay, days) });
      const byDate: Record<string, number> = {};
      for (const c of counts) byDate[c.night] = Math.max(0, freeOnNight(c).free);
      free[t.id] = byDate;
    }),
  );

  const nights: FeedNight[] = [];
  for (const row of rows) {
    for (const c of row.cells) {
      const available = free[row.roomTypeCode]?.[c.date] ?? 0;
      nights.push({
        date: c.date,
        roomTypeCode: row.roomTypeCode,
        planCode: row.planCode,
        price: c.price,
        available,
        stopSell: c.closed || available <= 0,
        closed: c.closed,
        closedToArrival: c.closedToArrival,
        closedToDeparture: c.closedToDeparture,
        minStay: c.minStay,
        maxStay: c.maxStay,
      });
    }
  }
  return { currency: book.currency, fromDay: params.fromDay, days, rows, free, nights };
}
