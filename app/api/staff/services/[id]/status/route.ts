import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { serviceStatusSchema } from "@/lib/validators";
import { withErrorHandling, notFound } from "@/lib/api-response";
import type { QueueEventType, ServiceStatus } from "@/app/generated/prisma/client";

const STATUS_TO_EVENT: Record<ServiceStatus, QueueEventType> = {
  OPEN: "OPEN",
  PAUSED: "PAUSE",
  CLOSED: "CLOSE",
};

export const PATCH = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireRole(req, ["STAFF", "ADMIN"]);
    const { id } = await ctx.params;
    const { status } = serviceStatusSchema.parse(await req.json());

    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) return notFound("Service not found");

    const updated = await prisma.service.update({ where: { id }, data: { status } });

    await prisma.queueEvent.create({
      data: { serviceId: id, actorId: user.id, type: STATUS_TO_EVENT[status] },
    });

    return NextResponse.json({ data: { id: updated.id, status: updated.status } });
  }
);
