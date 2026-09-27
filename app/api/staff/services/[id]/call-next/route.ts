import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { assertTransition, tokenLabel } from "@/lib/queue";
import { withErrorHandling, notFound, conflict } from "@/lib/api-response";

export const POST = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireRole(req, ["STAFF", "ADMIN"]);
    const { id } = await ctx.params;

    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) return notFound("Service not found");

    const alreadyCalled = await prisma.ticket.findFirst({
      where: { serviceId: id, status: "CALLED" },
    });
    if (alreadyCalled) {
      return conflict("Resolve the current ticket (served or no-show) before calling the next one");
    }

    const next = await prisma.ticket.findFirst({
      where: { serviceId: id, tokenDate: service.tokenDate, status: "WAITING" },
      orderBy: { tokenNumber: "asc" },
    });
    if (!next) return conflict("No one is waiting");

    assertTransition(next.status, "CALLED");

    const updated = await prisma.ticket.update({
      where: { id: next.id },
      data: { status: "CALLED", calledAt: new Date() },
    });

    await prisma.queueEvent.create({
      data: { serviceId: id, actorId: user.id, ticketId: updated.id, type: "CALL_NEXT" },
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        tokenLabel: tokenLabel(service.code, updated.tokenNumber),
        tokenNumber: updated.tokenNumber,
        status: updated.status,
        holderName: updated.holderName,
      },
    });
  }
);
