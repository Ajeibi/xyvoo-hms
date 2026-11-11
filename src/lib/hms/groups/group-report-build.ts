import type { ReportDocument } from "@/lib/hms/reports/model";
import type { GroupAccessContext } from "./group-access";
import { loadGroupAccounts } from "./group-accounts";
import { loadGroupFigures } from "./group-dashboard";
import { balanceSheetDocument, groupPerformanceDocument, profitAndLossDocument, trialBalanceDocument, type GroupReportKey } from "./group-reports";

/** Builds one group report for a date range, read with the caller's own token. */
export async function buildGroupReport(ctx: GroupAccessContext, key: GroupReportKey, from: string, to: string): Promise<ReportDocument> {
  const currency = ctx.group.baseCurrency;
  if (key === "performance") {
    const figures = await loadGroupFigures(ctx.userDb, ctx.hotels, { from, to }, true);
    return groupPerformanceDocument(ctx.group.name, figures, currency);
  }
  const view = await loadGroupAccounts(ctx, from, to);
  if (key === "trial-balance") return trialBalanceDocument(ctx.group.name, ctx.hotels, view.consolidation, to, currency, view.periods);
  if (key === "profit-and-loss") return profitAndLossDocument(ctx.group.name, ctx.hotels, view.consolidation, from, to, currency, view.periods);
  return balanceSheetDocument(ctx.group.name, ctx.hotels, view.consolidation, to, currency, view.periods);
}
