import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTicketSecretFromCookie, ticketSecretMatches } from "@/lib/auth";
import { computePosition, computeEtaSeconds, tokenLabel, assertTransition } from "@/lib/queue";
import { withErrorHandling, notFound, forbidden } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;

    const ticket = await prisma.ticket.findUnique({ where: { id }, include: { service: true } });
    if (!ticket) return notFound("Ticket not found");

    const position =
      ticket.status === "WAITING"
        ? await computePosition(ticket.serviceId, ticket.tokenDate, ticket.tokenNumber)
        : 0;
    const etaSeconds = ticket.status === "WAITING" ? await computeEtaSeconds(ticket.serviceId, position) : 0;

    return NextResponse.json({
      data: {
        id: ticket.id,
        tokenLabel: tokenLabel(ticket.service.code, ticket.tokenNumber),
        tokenNumber: ticket.tokenNumber,
        status: ticket.status,
        position,
        etaSeconds,
        service: { slug: ticket.service.slug, name: ticket.service.name },
      },
    });
  }
);

export const DELETE = withErrorHandling(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return notFound("Ticket not found");

    // The ticket id alone is never sufficient to cancel — the caller must
    // hold the httpOnly secret cookie issued at join, checked against its hash.
    const secret = await getTicketSecretFromCookie(id);
    if (!secret || !ticketSecretMatches(secret, ticket.secretHash)) {
      return forbidden("You do not have permission to cancel this ticket");
    }

    assertTransition(ticket.status, "CANCELLED");

    await prisma.ticket.update({
      where: { id },
      data: { status: "CANCELLED", closedAt: new Date() },
    });

    return NextResponse.json({ data: { ok: true } });
  }
);
