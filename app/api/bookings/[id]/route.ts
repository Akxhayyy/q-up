import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBookingSecretFromCookie, ticketSecretMatches } from "@/lib/auth";
import { assertBookingTransition } from "@/lib/queue";
import { withErrorHandling, notFound, forbidden } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { slot: true, service: true },
    });
    if (!booking) return notFound("Booking not found");

    return NextResponse.json({
      data: {
        id: booking.id,
        status: booking.status,
        holderName: booking.holderName,
        slot: {
          startsAt: booking.slot.startsAt,
          endsAt: booking.slot.endsAt,
        },
        service: { slug: booking.service.slug, name: booking.service.name },
        convertedTicketId: booking.convertedTicketId,
      },
    });
  }
);

export const DELETE = withErrorHandling(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) return notFound("Booking not found");

    const secret = await getBookingSecretFromCookie(id);
    if (!secret || !ticketSecretMatches(secret, booking.secretHash)) {
      return forbidden("You do not have permission to cancel this booking");
    }

    assertBookingTransition(booking.status, "CANCELLED");

    // Two independent atomic single-statement updates — deliberately not
    // wrapped in a Prisma transaction (interactive or batch), since both
    // forms hold a Postgres connection for their duration and this app
    // avoids that pattern everywhere after hitting a pool-exhaustion bug
    // under concurrent load on the ticket-issuance path. The status guard
    // in the WHERE clause keeps this update itself atomic and race-safe;
    // worst case on a crash between the two statements is a slot's
    // bookedCount left one too high, an acceptable edge case here.
    await prisma.booking.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    await prisma.serviceSlot.update({
      where: { id: booking.slotId },
      data: { bookedCount: { decrement: 1 } },
    });

    return NextResponse.json({ data: { ok: true } });
  }
);
