import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { withErrorHandling, badRequest } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole(req, ["STAFF", "ADMIN"]);
    const { id: serviceId } = await ctx.params;

    const date = req.nextUrl.searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return badRequest({ date: ["date must be YYYY-MM-DD"] });
    }

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const bookings = await prisma.booking.findMany({
      where: { serviceId, slot: { startsAt: { gte: dayStart, lte: dayEnd } } },
      include: { slot: true },
      orderBy: { slot: { startsAt: "asc" } },
    });

    return NextResponse.json({
      data: bookings.map((b) => ({
        id: b.id,
        holderName: b.holderName,
        studentId: b.studentId,
        status: b.status,
        startsAt: b.slot.startsAt,
        endsAt: b.slot.endsAt,
        updatedAt: b.updatedAt,
      })),
    });
  }
);
