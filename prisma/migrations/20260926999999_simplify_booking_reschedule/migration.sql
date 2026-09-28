-- Reschedule now moves an existing booking's slotId in place instead of
-- creating a second row (a fresh INSERT would collide with the
-- one_active_booking_per_student partial unique index while the original
-- row is still status='BOOKED'). No Booking rows exist yet, so this is safe.

-- NOTE: this migration was corrected after two partial failures (each
-- statement here commits independently rather than the file running as one
-- transaction, so earlier partial progress persisted). Current real state,
-- confirmed by direct inspection: "rescheduledToId" is already dropped; a
-- clean, unused "BookingStatus" type with the 4 correct values already
-- exists from the first attempt; the "status" column and the
-- one_active_booking_per_student index are still bound to the enum type
-- that got renamed to "BookingStatus_old". This finishes the job from there.

DROP INDEX IF EXISTS "one_active_booking_per_student";

ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "bookings" ALTER COLUMN "status" TYPE "BookingStatus" USING ("status"::text::"BookingStatus");
ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'BOOKED';
DROP TYPE IF EXISTS "BookingStatus_old";

CREATE UNIQUE INDEX "one_active_booking_per_student"
ON "bookings" ("serviceId", "studentId")
WHERE "status" = 'BOOKED';
