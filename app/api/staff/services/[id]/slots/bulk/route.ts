import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { bulkSlotSchema } from "@/lib/validators";
import { withErrorHandling, notFound } from "@/lib/api-response";

function parseHHMM(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { h, m };
}

export const POST = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireRole(req, ["STAFF", "ADMIN"]);
    const { id: serviceId } = await ctx.params;
    const body = bulkSlotSchema.parse(await req.json());

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) return notFound("Service not found");

    const start = parseHHMM(body.dailyStartTime);
    const end = parseHHMM(body.dailyEndTime);
    const dayStart = new Date(`${body.startDate}T00:00:00.000Z`);
    const dayEnd = new Date(`${body.endDate}T00:00:00.000Z`);
    const daysOfWeek = new Set(body.daysOfWeek);

    const toCreate: { serviceId: string; startsAt: Date; endsAt: Date; capacity: number }[] = [];

    for (
      let day = new Date(dayStart);
      day.getTime() <= dayEnd.getTime();
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      if (!daysOfWeek.has(day.getUTCDay())) continue;

      const dayStartMinutes = start.h * 60 + start.m;
      const dayEndMinutes = end.h * 60 + end.m;
      for (
        let minutes = dayStartMinutes;
        minutes + body.slotMinutes <= dayEndMinutes;
        minutes += body.slotMinutes
      ) {
        const startsAt = new Date(day);
        startsAt.setUTCHours(0, minutes, 0, 0);
        const endsAt = new Date(startsAt.getTime() + body.slotMinutes * 60_000);
        toCreate.push({ serviceId, startsAt, endsAt, capacity: body.capacity });
      }
    }

    // skipDuplicates relies on the @@unique([serviceId, startsAt]) constraint
    // to make re-running the same generation request idempotent.
    const result = await prisma.serviceSlot.createMany({ data: toCreate, skipDuplicates: true });

    await prisma.queueEvent.create({
      data: { serviceId, actorId: user.id, type: "SLOT_CREATED" },
    });

    return NextResponse.json({ data: { created: result.count, attempted: toCreate.length } });
  }
);
