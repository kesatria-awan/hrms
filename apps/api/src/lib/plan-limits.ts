export type PlanType = "free" | "pro";

export const PLAN_LIMITS = {
  free: {
    maxBoards: 5,
    maxMembers: 25,
    storageQuotaBytes: 524_288_000, // 500MB
  },
  pro: {
    maxBoards: Infinity,
    maxMembers: Infinity,
    storageQuotaBytes: 10_737_418_240, // 10GB
  },
} as const;

export function getPlanLimits(plan: PlanType) {
  return PLAN_LIMITS[plan];
}

export const PLAN_PRICING = {
  pro: { monthlyPriceCents: 4900, currency: "MYR", productName: "Tracky Pro Monthly" },
} as const;
