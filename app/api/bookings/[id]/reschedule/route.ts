import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rescheduleBookingSchema } from "@/lib/validators";
import { getBookingSecretFromCookie, ticketSecretMatches } from "@/lib/auth";
import { withErrorHandling, notFound, forbidden, conflict } from "@/lib/api-response";

export const POST = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id: bookingId } = await ctx.params;
    const { newSlotId } = rescheduleBookingSchema.parse(await req.json());

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return notFound("Booking not found");

    const secret = await getBookingSecretFromCookie(bookingId);
    if (!secret || !ticketSecretMatches(secret, booking.secretHash)) {
      return forbidden("You do not have permission to change this booking");
    }
    if (booking.status !== "BOOKED") {
      return conflict("This booking is no longer active");
    }

    const newSlot = await prisma.serviceSlot.findUnique({ where: { id: newSlotId } });
    if (!newSlot) return notFound("Slot not found");
    if (newSlot.serviceId !== booking.serviceId) {
      return conflict("Cannot reschedule to a different service");
    }
    if (newSlotId === booking.slotId) {
      return conflict("That's already your booked slot");
    }

    // Reschedule moves this same booking's slotId rather than creating a
    // second row — a fresh INSERT would collide with the one-active-booking
    // partial unique index while the original row is still status='BOOKED'.
    // Step 1: atomically claim capacity on the new slot.
    const claimed = await prisma.$queryRaw<{ id: string }[]>`
      UPDATE "service_slots"
      SET "bookedCount" = "bookedCount" + 1
      WHERE id = ${newSlotId} AND "bookedCount" < capacity
      RETURNING id
    `;
    if (claimed.length === 0) {
      return conflict("That slot is full — pick another time");
    }

    // Step 2: move the booking, guarded on it still being BOOKED (in case it
    // was cancelled by a concurrent request in the gap since we read it
    // above). If that guard fails, undo the capacity claim from step 1.
    const moved = await prisma.$queryRaw<{ id: string }[]>`
      UPDATE "bookings"
      SET "slotId" = ${newSlotId}, "updatedAt" = now()
      WHERE id = ${bookingId} AND status = 'BOOKED'
      RETURNING id
    `;
    if (moved.length === 0) {
      await prisma.serviceSlot.update({
        where: { id: newSlotId },
        data: { bookedCount: { decrement: 1 } },
      });
      return conflict("This booking is no longer active");
    }

    // Step 3: release the old slot's capacity now that the move succeeded.
    await prisma.serviceSlot.update({
      where: { id: booking.slotId },
      data: { bookedCount: { decrement: 1 } },
    });

    return NextResponse.json({ data: { id: bookingId, status: "BOOKED" } });
  }
);
