import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { createServiceSchema } from "@/lib/validators";
import { withErrorHandling, conflict } from "@/lib/api-response";
import { startOfTodayUTC } from "@/lib/queue";

export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireRole(req, ["ADMIN"]);
  const services = await prisma.service.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ data: services });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await requireRole(req, ["ADMIN"]);
  const body = createServiceSchema.parse(await req.json());

  try {
    const service = await prisma.service.create({
      data: {
        slug: body.slug,
        name: body.name,
        code: body.code,
        description: body.description,
        location: body.location,
        tokenDate: startOfTodayUTC(),
      },
    });

    await prisma.queueEvent.create({
      data: { serviceId: service.id, actorId: user.id, type: "SERVICE_CREATED" },
    });

    return NextResponse.json({ data: service }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return conflict("A service with that slug already exists");
    }
    throw err;
  }
});
