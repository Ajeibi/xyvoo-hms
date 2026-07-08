import type { MetricTileItem, StatusRowItem, SummaryTileItem } from "./shared";

export type FinancePeriod = "day" | "week" | "month" | "quarter";
export type FinanceMetric = "revenue" | "occupancy" | "adr" | "revpar" | "expenses" | "profit";

export type FloorStatusItem = {
  label: string;
  value: number;
  color: string;
  colorClass: string;
};

export type RoomStatusItem = {
  label: string;
  value: number;
};

export type OccupancyTrend = {
  labels: string[];
  values: number[];
};

export type FinancialBase = {
  grossRevenueToday: number;
  effectiveAverageRate: number;
  occupancyRate: number;
};

export type FinancialTrendView = {
  labels: string[];
  unitLabel: string;
  summary: string;
  metrics: Record<FinanceMetric, number[]>;
};

export type FinancialTrendViews = Record<FinancePeriod, FinancialTrendView>;

export type DashboardAnalyticsModel = {
  financialBase: FinancialBase;
  financialTrendViews: FinancialTrendViews;
  movementItems: MetricTileItem[];
  roomStatusItems: RoomStatusItem[];
  floorStatusItems: FloorStatusItem[];
  occupancyTrend: OccupancyTrend;
  foodAndBeverageItems: MetricTileItem[];
  outletBreakdownItems: StatusRowItem[];
  kitchenItems: MetricTileItem[];
  kitchenAlertItems: StatusRowItem[];
  inventorySummary: SummaryTileItem[];
  lowStockItems: StatusRowItem[];
  operationalAlerts: StatusRowItem[];
};
