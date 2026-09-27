import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { tokenLabel } from "@/lib/queue";
import { withErrorHandling, notFound } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole(req, ["STAFF", "ADMIN"]);
    const { id } = await ctx.params;

    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) return notFound("Service not found");

    const [called, waiting] = await Promise.all([
      prisma.ticket.findFirst({
        where: { serviceId: id, status: "CALLED" },
        orderBy: { calledAt: "desc" },
      }),
      prisma.ticket.findMany({
        where: { serviceId: id, tokenDate: service.tokenDate, status: "WAITING" },
        orderBy: { tokenNumber: "asc" },
      }),
    ]);

    const summarize = (t: (typeof waiting)[number]) => ({
      id: t.id,
      tokenLabel: tokenLabel(service.code, t.tokenNumber),
      tokenNumber: t.tokenNumber,
      holderName: t.holderName,
      studentId: t.studentId,
      status: t.status,
    });

    return NextResponse.json({
      data: {
        service: { id: service.id, slug: service.slug, name: service.name, status: service.status },
        called: called ? summarize(called) : null,
        waiting: waiting.map(summarize),
      },
    });
  }
);
