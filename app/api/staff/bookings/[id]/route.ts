import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { staffBookingActionSchema } from "@/lib/validators";
import { assertBookingTransition, QueueConflictError } from "@/lib/queue";
import { withErrorHandling, notFound, conflict } from "@/lib/api-response";

export const PATCH = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireRole(req, ["STAFF", "ADMIN"]);
    const { id: bookingId } = await ctx.params;
    const { action } = staffBookingActionSchema.parse(await req.json());

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return notFound("Booking not found");

    if (action === "NO_SHOW") {
      assertBookingTransition(booking.status, "NO_SHOW");
      await prisma.booking.update({ where: { id: bookingId }, data: { status: "NO_SHOW" } });
      await prisma.serviceSlot.update({
        where: { id: booking.slotId },
        data: { bookedCount: { decrement: 1 } },
      });
      await prisma.queueEvent.create({
        data: { serviceId: booking.serviceId, actorId: user.id, bookingId, type: "BOOKING_NO_SHOW" },
      });
      return NextResponse.json({ data: { id: bookingId, status: "NO_SHOW" } });
    }

    if (action === "CANCEL") {
      assertBookingTransition(booking.status, "CANCELLED");
      await prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } });
      await prisma.serviceSlot.update({
        where: { id: booking.slotId },
        data: { bookedCount: { decrement: 1 } },
      });
      await prisma.queueEvent.create({
        data: { serviceId: booking.serviceId, actorId: user.id, bookingId, type: "BOOKING_CANCELLED" },
      });
      return NextResponse.json({ data: { id: bookingId, status: "CANCELLED" } });
    }

    // CHECK_IN: converts the booking into a real live-queue ticket, reusing
    // the exact same atomic counter-increment + insert as a normal join —
    // a checked-in student takes their place in today's real queue.
    assertBookingTransition(booking.status, "CONVERTED");
    const service = await prisma.service.findUnique({ where: { id: booking.serviceId } });
    if (!service) return notFound("Service not found");

    const ticketId = randomUUID();
    try {
      const rows = await prisma.$queryRaw<{ id: string; tokenNumber: number }[]>`
        WITH updated AS (
          UPDATE "services"
          SET "lastTokenNumber" = CASE WHEN "tokenDate" = CURRENT_DATE THEN "lastTokenNumber" + 1 ELSE 1 END,
              "tokenDate" = CURRENT_DATE
          WHERE id = ${booking.serviceId} AND status = 'OPEN'
          RETURNING "lastTokenNumber", "tokenDate"
        )
        INSERT INTO "tickets" (id, "serviceId", "tokenNumber", "tokenDate", "holderName", "studentId", "secretHash", status, "issuedAt")
        SELECT ${ticketId}, ${booking.serviceId}, updated."lastTokenNumber", updated."tokenDate", ${booking.holderName}, ${booking.studentId}, ${booking.secretHash}, 'WAITING', now()
        FROM updated
        RETURNING id, "tokenNumber"
      `;

      if (rows.length === 0) {
        return conflict("This queue is not currently open — cannot check in yet");
      }

      await prisma.booking.update({
        where: { id: bookingId },
        data: { status: "CONVERTED", convertedTicketId: ticketId },
      });
      await prisma.serviceSlot.update({
        where: { id: booking.slotId },
        data: { bookedCount: { decrement: 1 } },
      });
      await prisma.queueEvent.create({
        data: {
          serviceId: booking.serviceId,
          actorId: user.id,
          bookingId,
          ticketId,
          type: "BOOKING_CHECKED_IN",
        },
      });

      return NextResponse.json({ data: { id: bookingId, status: "CONVERTED", ticketId } });
    } catch (err) {
      if (err instanceof QueueConflictError) return conflict(err.message);
      throw err;
    }
  }
);
