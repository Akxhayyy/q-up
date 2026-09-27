import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { withErrorHandling, notFound, conflict } from "@/lib/api-response";

export const DELETE = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole(req, ["STAFF", "ADMIN"]);
    const { id } = await ctx.params;

    const slot = await prisma.serviceSlot.findUnique({ where: { id } });
    if (!slot) return notFound("Slot not found");

    // bookedCount only reflects currently-active bookings; a slot with a
    // cancelled/converted/no-show booking in its history still has a Booking
    // row pointing at it via a non-nullable FK, so deletion would fail with
    // a raw P2003 even when bookedCount is back to 0. Check real history.
    const everBooked = await prisma.booking.count({ where: { slotId: id } });
    if (everBooked > 0) {
      return conflict("This slot has booking history — it can't be removed");
    }

    try {
      await prisma.serviceSlot.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        return conflict("This slot has booking history — it can't be removed");
      }
      throw err;
    }

    return NextResponse.json({ data: { ok: true } });
  }
);
