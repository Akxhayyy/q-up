import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeEtaSeconds, tokenLabel } from "@/lib/queue";
import { withErrorHandling } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  const data = await Promise.all(
    services.map(async (s) => {
      const waitingCount = await prisma.ticket.count({
        where: { serviceId: s.id, tokenDate: s.tokenDate, status: "WAITING" },
      });
      const etaSeconds = await computeEtaSeconds(s.id, waitingCount);
      const nowServing = await prisma.ticket.findFirst({
        where: { serviceId: s.id, tokenDate: s.tokenDate, status: "CALLED" },
        orderBy: { calledAt: "desc" },
      });

      return {
        id: s.id,
        slug: s.slug,
        name: s.name,
        code: s.code,
        description: s.description,
        location: s.location,
        status: s.status,
        waitingCount,
        etaSeconds,
        nowServing: nowServing ? tokenLabel(s.code, nowServing.tokenNumber) : null,
      };
    })
  );

  return NextResponse.json({ data });
});
