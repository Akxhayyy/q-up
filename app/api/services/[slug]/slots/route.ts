import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandling, notFound, badRequest } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params;
    const date = req.nextUrl.searchParams.get("date"); // "YYYY-MM-DD"
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return badRequest({ date: ["date must be YYYY-MM-DD"] });
    }

    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service || !service.isActive) return notFound("Service not found");

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const slots = await prisma.serviceSlot.findMany({
      where: { serviceId: service.id, startsAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { startsAt: "asc" },
    });

    return NextResponse.json({
      data: slots.map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        capacity: s.capacity,
        bookedCount: s.bookedCount,
        available: s.capacity - s.bookedCount,
      })),
    });
  }
);
