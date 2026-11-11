import { round2, type PeriodFigures } from "@/lib/hms/reports/numbers";

/*
 * Adding hotels' figures up into a group figure. Pure, so it is unit-tested and shared by the
 * dashboard, the reports and the scheduled email.
 *
 * Rates are never averaged across hotels: occupancy is rooms sold over rooms available for the whole
 * group, ADR is room rate revenue over rooms sold, RevPAR room rate revenue over rooms available.
 * A hotel with 200 rooms counts for more than one with 20, as it should.
 */

export function emptyPeriod(from: string, to: string): PeriodFigures {
  return {
    from,
    to,
    days: 0,
    roomsAvailable: 0,
    roomsSold: 0,
    roomRateRevenue: 0,
    roomsRevenue: 0,
    fbRevenue: 0,
    otherRevenue: 0,
    unclassifiedRevenue: 0,
    totalRevenue: 0,
    occupancy: null,
    adr: null,
    revpar: null,
  };
}

export function combinePeriods(periods: PeriodFigures[], from: string, to: string): PeriodFigures {
  if (periods.length === 0) return emptyPeriod(from, to);
  const sum = (pick: (p: PeriodFigures) => number) => round2(periods.reduce((s, p) => s + pick(p), 0));
  const roomsAvailable = periods.reduce((s, p) => s + p.roomsAvailable, 0);
  const roomsSold = periods.reduce((s, p) => s + p.roomsSold, 0);
  const roomRateRevenue = sum((p) => p.roomRateRevenue);
  const roomsRevenue = sum((p) => p.roomsRevenue);
  const fbRevenue = sum((p) => p.fbRevenue);
  const otherRevenue = sum((p) => p.otherRevenue);
  const unclassifiedRevenue = sum((p) => p.unclassifiedRevenue);
  return {
    from,
    to,
    days: Math.max(...periods.map((p) => p.days)),
    roomsAvailable,
    roomsSold,
    roomRateRevenue,
    roomsRevenue,
    fbRevenue,
    otherRevenue,
    unclassifiedRevenue,
    totalRevenue: round2(roomsRevenue + fbRevenue + otherRevenue + unclassifiedRevenue),
    occupancy: roomsAvailable > 0 ? Math.round((roomsSold / roomsAvailable) * 1000) / 10 : null,
    adr: roomsSold > 0 ? round2(roomRateRevenue / roomsSold) : null,
    revpar: roomsAvailable > 0 ? round2(roomRateRevenue / roomsAvailable) : null,
  };
}

/** Each hotel's share of a group total, in percent (one decimal). */
export function shareOf(part: number, total: number): number | null {
  if (!total) return null;
  return Math.round((part / total) * 1000) / 10;
}
