import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { ticketActionSchema } from "@/lib/validators";
import { assertTransition } from "@/lib/queue";
import { withErrorHandling, notFound } from "@/lib/api-response";
import type { TicketStatus } from "@/app/generated/prisma/client";
import type { QueueEventType } from "@/app/generated/prisma/client";

const ACTION_TO_STATUS: Record<string, TicketStatus> = {
  SERVE: "SERVED",
  NO_SHOW: "NO_SHOW",
  RECALL: "WAITING",
};

const ACTION_TO_EVENT: Record<string, QueueEventType> = {
  SERVE: "SERVED",
  NO_SHOW: "NO_SHOW",
  RECALL: "RECALL",
};

export const PATCH = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireRole(req, ["STAFF", "ADMIN"]);
    const { id } = await ctx.params;
    const { action } = ticketActionSchema.parse(await req.json());

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return notFound("Ticket not found");

    const nextStatus = ACTION_TO_STATUS[action];
    assertTransition(ticket.status, nextStatus);

    const now = new Date();
    const data =
      action === "SERVE"
        ? { status: nextStatus, servedAt: now }
        : action === "NO_SHOW"
          ? { status: nextStatus, closedAt: now }
          : { status: nextStatus, calledAt: null }; // RECALL: back to waiting

    const updated = await prisma.ticket.update({ where: { id }, data });

    await prisma.queueEvent.create({
      data: {
        serviceId: ticket.serviceId,
        actorId: user.id,
        ticketId: ticket.id,
        type: ACTION_TO_EVENT[action],
      },
    });

    return NextResponse.json({ data: { id: updated.id, status: updated.status } });
  }
);
