-- One active ticket per student per service per day.
-- A plain composite unique index would wrongly block rejoining after a cancel,
-- so this is partial: it only applies while the ticket is still WAITING or CALLED.
CREATE UNIQUE INDEX "one_active_ticket_per_student"
ON "tickets" ("serviceId", "tokenDate", "studentId")
WHERE "status" IN ('WAITING', 'CALLED');
