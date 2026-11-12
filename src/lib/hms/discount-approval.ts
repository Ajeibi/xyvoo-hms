/*
 * Who approved a check-in discount that is above the hotel's limit, and whether a booking that is being
 * reopened keeps the code it already carries. Pure rules, used by the check-in route and tested alone.
 */

export type ApprovalManager = { userId: string; isAdmin: boolean };

/**
 * A signed-in owner or admin approves for themselves. Anyone else has used the shared manager PIN, so
 * the desk must say which owner or admin approved, and that person must really be one of this hotel's.
 */
export function resolveDiscountApprover(params: {
  signedInUserId: string;
  signedInIsAdmin: boolean;
  chosenApproverId: string | null | undefined;
  managers: ApprovalManager[];
}): { ok: true; approverId: string } | { ok: false; error: string } {
  if (params.signedInIsAdmin) return { ok: true, approverId: params.signedInUserId };
  const chosen = params.chosenApproverId ?? null;
  if (!chosen || !params.managers.some((m) => m.isAdmin && m.userId === chosen)) {
    return { ok: false, error: "Choose which owner or admin approved this discount." };
  }
  return { ok: true, approverId: chosen };
}

/**
 * A booking reopened with its code already on it keeps that code and the discount it was given, even if the
 * code has since expired. Returns the held discount, or null when the typed code is a different one.
 */
export function heldDiscountFor(
  typedCode: string,
  held: { discount_package_code?: string | null; pricing_snapshot?: unknown } | null | undefined,
): { code: string; percent: number; scope: string } | null {
  const code = held?.discount_package_code;
  const snap = (held?.pricing_snapshot ?? {}) as { discountPercent?: number; discountScope?: string };
  if (!code || !snap.discountScope) return null;
  if (code.toUpperCase() !== typedCode.trim().toUpperCase()) return null;
  return { code, percent: Number(snap.discountPercent) || 0, scope: snap.discountScope };
}
