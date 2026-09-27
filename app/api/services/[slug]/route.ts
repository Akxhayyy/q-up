import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeEtaSeconds, tokenLabel } from "@/lib/queue";
import { withErrorHandling, notFound } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params;

    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service || !service.isActive) return notFound("Service not found");

    const waitingCount = await prisma.ticket.count({
      where: { serviceId: service.id, tokenDate: service.tokenDate, status: "WAITING" },
    });
    const etaSeconds = await computeEtaSeconds(service.id, waitingCount);
    const nowServing = await prisma.ticket.findFirst({
      where: { serviceId: service.id, tokenDate: service.tokenDate, status: "CALLED" },
      orderBy: { calledAt: "desc" },
    });
    const upcoming = await prisma.ticket.findMany({
      where: { serviceId: service.id, tokenDate: service.tokenDate, status: "WAITING" },
      orderBy: { tokenNumber: "asc" },
      take: 3,
    });

    return NextResponse.json({
      data: {
        id: service.id,
        slug: service.slug,
        name: service.name,
        code: service.code,
        description: service.description,
        location: service.location,
        status: service.status,
        waitingCount,
        etaSeconds,
        nowServing: nowServing ? tokenLabel(service.code, nowServing.tokenNumber) : null,
        upcoming: upcoming.map((t) => tokenLabel(service.code, t.tokenNumber)),
      },
    });
  }
);
