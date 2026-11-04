/** Loyalty points and tiers: the rules, safe for the browser and the server. */

export type LoyaltyTier = { name: string; minPoints: number; perks: string };

export type LoyaltySettings = {
  enabled: boolean;
  /** Spend that earns one point, in the hotel's currency. */
  spendPerPoint: number;
  /** What one point is worth when it is redeemed. */
  pointValue: number;
  /** Stays that checked out before this date earn nothing. */
  earnFrom: string | null;
  tiers: LoyaltyTier[];
};

export const DEFAULT_LOYALTY: LoyaltySettings = {
  enabled: false,
  spendPerPoint: 1000,
  pointValue: 1,
  earnFrom: null,
  tiers: [
    { name: "Member", minPoints: 0, perks: "" },
    { name: "Silver", minPoints: 500, perks: "" },
    { name: "Gold", minPoints: 2000, perks: "" },
  ],
};

export type LoyaltyLedgerEntry = {
  id: string;
  points: number;
  kind: "earn" | "redeem" | "adjust";
  note: string | null;
  confirmationCode: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type GuestLoyalty = {
  /** Points they can spend now. */
  balance: number;
  /** Everything they have ever earned (redeeming never lowers it), which decides the tier. */
  lifetime: number;
  tier: LoyaltyTier | null;
  nextTier: LoyaltyTier | null;
  pointsToNextTier: number | null;
  ledger: LoyaltyLedgerEntry[];
};

/** Whole points earned by a stay's bill. */
export function pointsForSpend(spend: number, spendPerPoint: number) {
  if (!(spendPerPoint > 0) || !(spend > 0)) return 0;
  return Math.floor(spend / spendPerPoint);
}

/** Tiers sorted lowest first, with blank names dropped. */
export function cleanTiers(tiers: LoyaltyTier[]): LoyaltyTier[] {
  return tiers
    .map((t) => ({ name: t.name.trim(), minPoints: Math.max(0, Math.floor(Number(t.minPoints) || 0)), perks: (t.perks ?? "").trim() }))
    .filter((t) => t.name.length > 0)
    .sort((a, b) => a.minPoints - b.minPoints);
}

/** Which tier a lifetime total reaches, and what is next. */
export function tierFor(lifetime: number, tiers: LoyaltyTier[]) {
  const sorted = cleanTiers(tiers);
  let tier: LoyaltyTier | null = null;
  let next: LoyaltyTier | null = null;
  for (const t of sorted) {
    if (lifetime >= t.minPoints) tier = t;
    else {
      next = t;
      break;
    }
  }
  return { tier, nextTier: next, pointsToNextTier: next ? next.minPoints - lifetime : null };
}

/** The balance and lifetime from a list of point movements. */
export function totalsOf(points: number[]) {
  let balance = 0;
  let lifetime = 0;
  for (const p of points) {
    balance += p;
    if (p > 0) lifetime += p;
  }
  return { balance, lifetime };
}
