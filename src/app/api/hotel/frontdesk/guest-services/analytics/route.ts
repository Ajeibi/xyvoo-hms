import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getGuestServicesCapabilities } from "@/lib/hms/guest-services-rbac";
import { listGuestRequestsForTenant } from "@/lib/hms/guest-services";

const Query = z.object({
  slug: z.string().min(1),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = Query.parse({ slug: url.searchParams.get("slug") });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getGuestServicesCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canView) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { requests } = await listGuestRequestsForTenant(
      auth.service,
      auth.tenant.id,
      { limit: 500 },
      caps,
    );

    const byCategory = new Map<string, number>();
    let completedWithDuration = 0;
    let sumMinutes = 0;
    const byDept = new Map<string, number>();

    for (const r of requests) {
      byCategory.set(r.serviceCategory, (byCategory.get(r.serviceCategory) ?? 0) + 1);
      byDept.set(r.department, (byDept.get(r.department) ?? 0) + 1);
      if (r.status === "completed" && r.completedAt) {
        const start = new Date(r.createdAt).getTime();
        const end = new Date(r.completedAt).getTime();
        if (end > start) {
          completedWithDuration += 1;
          sumMinutes += (end - start) / 60000;
        }
      }
    }

    const delayed = requests.filter(
      (r) =>
        r.expectedCompletedAt &&
        !["completed", "cancelled"].includes(r.status) &&
        new Date(r.expectedCompletedAt).getTime() < Date.now(),
    ).length;

    const requestTypeCounts = new Map<string, number>();
    const assigneeAgg = new Map<string, { userId: string; name: string; count: number }>();
    for (const r of requests) {
      requestTypeCounts.set(r.requestType, (requestTypeCounts.get(r.requestType) ?? 0) + 1);
      if (r.assignedUserId) {
        const cur = assigneeAgg.get(r.assignedUserId) ?? {
          userId: r.assignedUserId,
          name: r.assignedStaffName ?? "Staff",
          count: 0,
        };
        cur.count += 1;
        assigneeAgg.set(r.assignedUserId, cur);
      }
    }

    const topRequestTypes = [...requestTypeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([requestType, count]) => ({ requestType, count }));

    const byAssignee = [...assigneeAgg.values()].sort((a, b) => b.count - a.count).slice(0, 8);

    return NextResponse.json({
      avgCompletionMinutes:
        completedWithDuration > 0 ? Math.round((sumMinutes / completedWithDuration) * 10) / 10 : null,
      byCategory: Object.fromEntries(byCategory),
      byDepartment: Object.fromEntries(byDept),
      delayedOpen: delayed,
      totalSampled: requests.length,
      topRequestTypes,
      byAssignee,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Analytics failed." }, { status: 500 });
  }
}
