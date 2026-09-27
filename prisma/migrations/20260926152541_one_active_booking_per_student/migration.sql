-- One active (BOOKED) reservation per student per service at a time. Mirrors
-- one_active_ticket_per_student: partial, not a plain composite unique, so a
-- cancelled/converted booking never blocks a future rebooking.
CREATE UNIQUE INDEX "one_active_booking_per_student"
ON "bookings" ("serviceId", "studentId")
WHERE "status" = 'BOOKED';
