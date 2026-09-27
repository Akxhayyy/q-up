import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { startOfTodayUTC } from "@/lib/queue";
import { withErrorHandling } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const HISTORY_DAYS = 6;

export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireRole(req, ["STAFF", "ADMIN"]);

  const todayStart = startOfTodayUTC();
  const historyStart = new Date(todayStart);
  historyStart.setUTCDate(historyStart.getUTCDate() - HISTORY_DAYS);

  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });

  const [todayIssued, todayServed, todayCancelled, todayNoShow, todayWaiting] = await Promise.all([
    prisma.ticket.count({ where: { issuedAt: { gte: todayStart } } }),
    prisma.ticket.count({ where: { status: "SERVED", servedAt: { gte: todayStart } } }),
    prisma.ticket.count({ where: { status: "CANCELLED", closedAt: { gte: todayStart } } }),
    prisma.ticket.count({ where: { status: "NO_SHOW", closedAt: { gte: todayStart } } }),
    prisma.ticket.count({ where: { status: "WAITING" } }),
  ]);

  const histogramRows = await prisma.$queryRaw<{ hour: number; count: number }[]>`
    SELECT EXTRACT(HOUR FROM "issuedAt")::int AS hour, COUNT(*)::int AS count
    FROM "tickets"
    WHERE "issuedAt" >= ${historyStart}
    GROUP BY hour
    ORDER BY hour
  `;
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: histogramRows.find((r) => r.hour === hour)?.count ?? 0,
  }));

  const perService = await Promise.all(
    services.map(async (s) => {
      const [agg] = await prisma.$queryRaw<
        {
          avgWaitSecs: number | null;
          avgServiceSecs: number | null;
          issuedTotal: number;
          servedTotal: number;
          cancelledTotal: number;
          noShowTotal: number;
        }[]
      >`
        SELECT
          (AVG(EXTRACT(EPOCH FROM ("calledAt" - "issuedAt"))) FILTER (WHERE "calledAt" IS NOT NULL))::float AS "avgWaitSecs",
          (AVG(EXTRACT(EPOCH FROM ("servedAt" - "calledAt"))) FILTER (WHERE "status" = 'SERVED'))::float AS "avgServiceSecs",
          COUNT(*)::int AS "issuedTotal",
          (COUNT(*) FILTER (WHERE "status" = 'SERVED'))::int AS "servedTotal",
          (COUNT(*) FILTER (WHERE "status" = 'CANCELLED'))::int AS "cancelledTotal",
          (COUNT(*) FILTER (WHERE "status" = 'NO_SHOW'))::int AS "noShowTotal"
        FROM "tickets"
        WHERE "serviceId" = ${s.id} AND "issuedAt" >= ${historyStart}
      `;
      const waitingNow = await prisma.ticket.count({ where: { serviceId: s.id, status: "WAITING" } });

      return {
        slug: s.slug,
        name: s.name,
        code: s.code,
        waitingNow,
        issuedTotal: agg?.issuedTotal ?? 0,
        servedTotal: agg?.servedTotal ?? 0,
        cancelledTotal: agg?.cancelledTotal ?? 0,
        noShowTotal: agg?.noShowTotal ?? 0,
        avgWaitSecs: agg?.avgWaitSecs ? Math.round(agg.avgWaitSecs) : null,
        avgServiceSecs: agg?.avgServiceSecs ? Math.round(agg.avgServiceSecs) : null,
      };
    })
  );

  return NextResponse.json({
    data: {
      today: {
        issued: todayIssued,
        served: todayServed,
        cancelled: todayCancelled,
        noShow: todayNoShow,
        waiting: todayWaiting,
      },
      hourly,
      perService,
    },
  });
});
