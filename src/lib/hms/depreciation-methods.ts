export type DepreciationMethod = "straight_line" | "declining_balance";

export const DEPRECIATION_METHOD_LABELS: Record<DepreciationMethod, string> = {
  straight_line: "Straight line",
  declining_balance: "Declining balance (double rate)",
};
