import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandling, notFound, badRequest } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/** YYYY-MM-DD in UTC, matching how slot dates are grouped everywhere else here. */
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const GET = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params;
    const month = req.nextUrl.searchParams.get("month"); // "YYYY-MM"
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return badRequest({ month: ["month must be YYYY-MM"] });
    }

    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service || !service.isActive) return notFound("Service not found");

    const [year, mon] = month.split("-").map(Number);
    const rangeStart = new Date(Date.UTC(year, mon - 1, 1));
    const rangeEnd = new Date(Date.UTC(year, mon, 1));

    const slots = await prisma.serviceSlot.findMany({
      where: { serviceId: service.id, startsAt: { gte: rangeStart, lt: rangeEnd } },
      select: { startsAt: true, capacity: true, bookedCount: true },
    });

    const byDate = new Map<string, { capacity: number; booked: number }>();
    for (const s of slots) {
      const key = dateKey(s.startsAt);
      const entry = byDate.get(key) ?? { capacity: 0, booked: 0 };
      entry.capacity += s.capacity;
      entry.booked += s.bookedCount;
      byDate.set(key, entry);
    }

    const days = Array.from(byDate.entries())
      .map(([date, v]) => ({
        date,
        availableSeats: v.capacity - v.booked,
        totalCapacity: v.capacity,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ data: { days } });
  }
);
