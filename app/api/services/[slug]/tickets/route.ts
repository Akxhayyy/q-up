import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { joinTicketSchema } from "@/lib/validators";
import { generateTicketSecret, hashTicketSecret, setTicketSecretCookie } from "@/lib/auth";
import { tokenLabel } from "@/lib/queue";
import { withErrorHandling, notFound, conflict } from "@/lib/api-response";

export const POST = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params;
    const body = joinTicketSchema.parse(await req.json());

    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service || !service.isActive) return notFound("Service not found");

    const secret = generateTicketSecret();
    const secretHash = hashTicketSecret(secret);
    const ticketId = randomUUID();

    try {
      // One statement, one round trip: the CASE-based counter increment and
      // the ticket insert share a single CTE, so Postgres commits both
      // atomically without Prisma needing to hold an interactive transaction
      // open across multiple round trips (that held-connection-per-request
      // model doesn't scale under concurrent load on Neon's pooled adapter —
      // see the P2028 "unable to start a transaction" failures this replaced).
      // Zero rows back means the queue isn't OPEN.
      const rows = await prisma.$queryRaw<
        { id: string; tokenNumber: number; tokenDate: Date; status: string }[]
      >`
        WITH updated AS (
          UPDATE "services"
          SET "lastTokenNumber" = CASE WHEN "tokenDate" = CURRENT_DATE THEN "lastTokenNumber" + 1 ELSE 1 END,
              "tokenDate" = CURRENT_DATE
          WHERE id = ${service.id} AND status = 'OPEN'
          RETURNING "lastTokenNumber", "tokenDate"
        )
        INSERT INTO "tickets" (id, "serviceId", "tokenNumber", "tokenDate", "holderName", "studentId", "secretHash", status, "issuedAt")
        SELECT ${ticketId}, ${service.id}, updated."lastTokenNumber", updated."tokenDate", ${body.holderName}, ${body.studentId}, ${secretHash}, 'WAITING', now()
        FROM updated
        RETURNING id, "tokenNumber", "tokenDate", status
      `;

      if (rows.length === 0) {
        return conflict("This queue is not currently open");
      }

      const ticket = rows[0];
      await setTicketSecretCookie(ticket.id, secret);

      return NextResponse.json(
        {
          data: {
            id: ticket.id,
            tokenLabel: tokenLabel(service.code, ticket.tokenNumber),
            tokenNumber: ticket.tokenNumber,
            status: ticket.status,
          },
        },
        { status: 201 }
      );
    } catch (err) {
      // The partial unique index (one_active_ticket_per_student) still fires
      // on this raw INSERT; Prisma wraps the underlying 23505 as P2010 for
      // raw queries (it can only map to the friendlier P2002 for queries it
      // built itself from a schema-declared @@unique).
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === "P2010" || err.code === "P2002") &&
        JSON.stringify(err.meta ?? {}).includes("one_active_ticket_per_student")
      ) {
        return conflict("You already have an active ticket for this service today");
      }
      throw err;
    }
  }
);
