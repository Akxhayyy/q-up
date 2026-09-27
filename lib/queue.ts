import { prisma } from "@/lib/prisma";
import type { TicketStatus, BookingStatus } from "@/app/generated/prisma/client";

/** Thrown for any ticket/service state transition not explicitly allowed below. */
export class QueueConflictError extends Error {}

// WAITING -> CALLED -> SERVED
// WAITING -> CANCELLED
// CALLED  -> NO_SHOW
// CALLED  -> WAITING     (recall)
const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  WAITING: ["CALLED", "CANCELLED"],
  CALLED: ["SERVED", "NO_SHOW", "WAITING"],
  SERVED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function assertTransition(current: TicketStatus, next: TicketStatus) {
  if (!ALLOWED_TRANSITIONS[current]?.includes(next)) {
    throw new QueueConflictError(`Cannot move ticket from ${current} to ${next}`);
  }
}

// BOOKED -> CANCELLED
// BOOKED -> CONVERTED   (staff checks the student in on the day; becomes a real Ticket)
// BOOKED -> NO_SHOW     (staff marks it after the slot passed with no check-in)
// Rescheduling moves a BOOKED booking's slotId in place — it is not a status
// transition, so it isn't listed here (see app/api/bookings/[id]/reschedule).
// All three below are terminal — a booking's outcome doesn't change once decided.
const ALLOWED_BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  BOOKED: ["CANCELLED", "CONVERTED", "NO_SHOW"],
  CANCELLED: [],
  CONVERTED: [],
  NO_SHOW: [],
};

export function assertBookingTransition(current: BookingStatus, next: BookingStatus) {
  if (!ALLOWED_BOOKING_TRANSITIONS[current]?.includes(next)) {
    throw new QueueConflictError(`Cannot move booking from ${current} to ${next}`);
  }
}

/** Midnight UTC today — matches Postgres's CURRENT_DATE, which is what tokenDate is compared against. */
export function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function tokenLabel(code: string, tokenNumber: number): string {
  return `${code}-${String(tokenNumber).padStart(3, "0")}`;
}

/** Position among WAITING tickets, 0 = next to be called. Derived, never stored. */
export async function computePosition(serviceId: string, tokenDate: Date, tokenNumber: number): Promise<number> {
  return prisma.ticket.count({
    where: {
      serviceId,
      tokenDate,
      status: "WAITING",
      tokenNumber: { lt: tokenNumber },
    },
  });
}

const DEFAULT_SERVICE_SECS = 300;

/**
 * ETA = position * rolling average of (servedAt - calledAt) over the last ~20
 * served tickets for this service. Falls back to Service.avgServiceSecs (or a
 * flat default) only until real history exists. Always approximate.
 */
export async function computeEtaSeconds(serviceId: string, position: number): Promise<number> {
  const recentServed = await prisma.ticket.findMany({
    where: { serviceId, status: "SERVED", calledAt: { not: null }, servedAt: { not: null } },
    orderBy: { servedAt: "desc" },
    take: 20,
    select: { calledAt: true, servedAt: true },
  });

  let avgSecs = DEFAULT_SERVICE_SECS;
  if (recentServed.length > 0) {
    const totalSecs = recentServed.reduce(
      (sum, t) => sum + (t.servedAt!.getTime() - t.calledAt!.getTime()) / 1000,
      0
    );
    avgSecs = totalSecs / recentServed.length;
  } else {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { avgServiceSecs: true },
    });
    if (service?.avgServiceSecs) avgSecs = service.avgServiceSecs;
  }

  return Math.round(position * avgSecs);
}
