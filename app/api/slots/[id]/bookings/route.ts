import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { bookSlotSchema } from "@/lib/validators";
import { generateTicketSecret, hashTicketSecret, setBookingSecretCookie } from "@/lib/auth";
import { withErrorHandling, notFound, conflict } from "@/lib/api-response";

export const POST = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id: slotId } = await ctx.params;
    const body = bookSlotSchema.parse(await req.json());

    const slot = await prisma.serviceSlot.findUnique({ where: { id: slotId } });
    if (!slot) return notFound("Slot not found");

    const secret = generateTicketSecret();
    const secretHash = hashTicketSecret(secret);
    const bookingId = randomUUID();

    try {
      // Same trick as token issuance: the capacity check and the booking
      // insert are one statement, so two students racing for the last seat
      // can't both succeed — Postgres serializes the row-level update, the
      // second request re-checks the already-incremented count and gets
      // zero rows back instead of overbooking.
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        WITH updated AS (
          UPDATE "service_slots"
          SET "bookedCount" = "bookedCount" + 1
          WHERE id = ${slotId} AND "bookedCount" < capacity
          RETURNING id
        )
        INSERT INTO "bookings" (id, "slotId", "serviceId", "holderName", "studentId", "secretHash", status, "createdAt", "updatedAt")
        SELECT ${bookingId}, ${slotId}, ${slot.serviceId}, ${body.holderName}, ${body.studentId}, ${secretHash}, 'BOOKED', now(), now()
        FROM updated
        RETURNING id
      `;

      if (rows.length === 0) {
        return conflict("This slot is full");
      }

      await setBookingSecretCookie(bookingId, secret);

      return NextResponse.json({ data: { id: bookingId, status: "BOOKED" } }, { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === "P2010" || err.code === "P2002") &&
        JSON.stringify(err.meta ?? {}).includes("one_active_booking_per_student")
      ) {
        return conflict("You already have an active booking for this service");
      }
      throw err;
    }
  }
);
