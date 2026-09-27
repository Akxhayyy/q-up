-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'CANCELLED', 'RESCHEDULED', 'CONVERTED', 'NO_SHOW');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QueueEventType" ADD VALUE 'SLOT_CREATED';
ALTER TYPE "QueueEventType" ADD VALUE 'BOOKING_CREATED';
ALTER TYPE "QueueEventType" ADD VALUE 'BOOKING_CANCELLED';
ALTER TYPE "QueueEventType" ADD VALUE 'BOOKING_RESCHEDULED';
ALTER TYPE "QueueEventType" ADD VALUE 'BOOKING_CHECKED_IN';
ALTER TYPE "QueueEventType" ADD VALUE 'BOOKING_NO_SHOW';

-- AlterTable
ALTER TABLE "queue_events" ADD COLUMN     "bookingId" TEXT;

-- CreateTable
CREATE TABLE "service_slots" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "rescheduledToId" TEXT,
    "convertedTicketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_slots_serviceId_startsAt_idx" ON "service_slots"("serviceId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "service_slots_serviceId_startsAt_key" ON "service_slots"("serviceId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_rescheduledToId_key" ON "bookings"("rescheduledToId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_convertedTicketId_key" ON "bookings"("convertedTicketId");

-- CreateIndex
CREATE INDEX "bookings_serviceId_studentId_idx" ON "bookings"("serviceId", "studentId");

-- AddForeignKey
ALTER TABLE "service_slots" ADD CONSTRAINT "service_slots_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "service_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rescheduledToId_fkey" FOREIGN KEY ("rescheduledToId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_convertedTicketId_fkey" FOREIGN KEY ("convertedTicketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_events" ADD CONSTRAINT "queue_events_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
