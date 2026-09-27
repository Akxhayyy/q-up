import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { createSlotSchema } from "@/lib/validators";
import { withErrorHandling, notFound, badRequest, conflict } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole(req, ["STAFF", "ADMIN"]);
    const { id: serviceId } = await ctx.params;

    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    if (!from || !to) return badRequest({ from: ["from and to (ISO dates) are required"] });

    const slots = await prisma.serviceSlot.findMany({
      where: { serviceId, startsAt: { gte: new Date(from), lt: new Date(to) } },
      orderBy: { startsAt: "asc" },
    });

    return NextResponse.json({
      data: slots.map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        capacity: s.capacity,
        bookedCount: s.bookedCount,
      })),
    });
  }
);

export const POST = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireRole(req, ["STAFF", "ADMIN"]);
    const { id: serviceId } = await ctx.params;
    const body = createSlotSchema.parse(await req.json());

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) return notFound("Service not found");

    try {
      const slot = await prisma.serviceSlot.create({
        data: {
          serviceId,
          startsAt: new Date(body.startsAt),
          endsAt: new Date(body.endsAt),
          capacity: body.capacity,
        },
      });

      await prisma.queueEvent.create({
        data: { serviceId, actorId: user.id, type: "SLOT_CREATED" },
      });

      return NextResponse.json({ data: slot }, { status: 201 });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return conflict("A slot already starts at that time for this service");
      }
      throw err;
    }
  }
);
