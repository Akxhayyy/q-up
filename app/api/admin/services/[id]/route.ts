import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { updateServiceSchema } from "@/lib/validators";
import { withErrorHandling, notFound, conflict } from "@/lib/api-response";

export const PATCH = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireRole(req, ["ADMIN"]);
    const { id } = await ctx.params;
    const body = updateServiceSchema.parse(await req.json());

    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) return notFound("Service not found");

    try {
      const service = await prisma.service.update({ where: { id }, data: body });

      await prisma.queueEvent.create({
        data: { serviceId: service.id, actorId: user.id, type: "SERVICE_UPDATED" },
      });

      return NextResponse.json({ data: service });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return conflict("A service with that slug already exists");
      }
      throw err;
    }
  }
);
