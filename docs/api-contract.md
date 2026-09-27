# Q-Up API Contract

All responses use one shape. Success:

```json
{ "data": ... }
```

Error (never a bare 500 with a stack trace):

```json
{ "error": { "code": "CONFLICT", "message": "...", "details": { "field": ["reason"] } } }
```

`code` is one of `VALIDATION_ERROR` (400) · `UNAUTHENTICATED` (401) · `FORBIDDEN` (403) · `NOT_FOUND` (404) · `CONFLICT` (409) · `RATE_LIMITED` (429) · `INTERNAL_ERROR` (500). `details` only appears on `VALIDATION_ERROR`.

All routes below are implemented and curl-verified against a live Neon database as of this commit.

---

## Auth

### `POST /api/auth/login`
Public. Body: `{ email: string, password: string }`. Sets an httpOnly session cookie on success.
→ `{ data: { id, name, email, role: "STAFF"|"ADMIN" } }`
→ `401 UNAUTHENTICATED` on bad credentials.

### `POST /api/auth/logout`
Clears the session cookie. → `{ data: { ok: true } }`

### `GET /api/me`
→ `{ data: { id, name, email, role } }` or `401 UNAUTHENTICATED`.

---

## Services (public)

### `GET /api/services`
→ `{ data: [{ id, slug, name, code, description, location, status, waitingCount, etaSeconds, nowServing }] }`
`nowServing` is a token label string (e.g. `"CERT-042"`) or `null`.

### `GET /api/services/:slug`
Same shape as one list item, plus `upcoming: string[]` — token labels of the next few `WAITING` tickets (used by the display board). → `404 NOT_FOUND` if the slug doesn't exist or the service is inactive.

### `POST /api/services/:slug/tickets` — JOIN
Body: `{ holderName: string, studentId: string }`. Sets an httpOnly `ticketSecret` cookie scoped to the new ticket id.
→ `201 { data: { id, tokenLabel, tokenNumber, status: "WAITING" } }`
→ `409 CONFLICT` — queue not `OPEN` ("This queue is not currently open").
→ `409 CONFLICT` — already has an active ticket today for this service (DB partial unique index, not a pre-check).
→ `400 VALIDATION_ERROR` on bad body.

Token issuance is one atomic SQL statement (a CTE combining the counter `UPDATE ... RETURNING` and the `Ticket` `INSERT`) — proven race-free by `npm run concurrency-test` (100 parallel joins → 100 unique, gap-free tokens).

### `GET /api/services/:slug/availability?month=YYYY-MM`
Public. → `{ data: { days: [{ date: "YYYY-MM-DD", availableSeats, totalCapacity }] } }` — only dates with at least one slot appear. Powers the student booking calendar.

### `GET /api/services/:slug/slots?date=YYYY-MM-DD`
Public. → `{ data: [{ id, startsAt, endsAt, capacity, bookedCount, available }] }`.

---

## Tickets (public + ticket-secret cookie)

### `GET /api/tickets/:id` — the polled endpoint (SWR, 3s)
→ `{ data: { id, tokenLabel, tokenNumber, status, position, etaSeconds, service: { slug, name } } }`
`position`/`etaSeconds` are `0` once the ticket leaves `WAITING`.
→ `404 NOT_FOUND`.

### `DELETE /api/tickets/:id` — cancel
Requires the httpOnly ticket-secret cookie set at join; the ticket id alone is never sufficient.
→ `{ data: { ok: true } }`
→ `403 FORBIDDEN` — missing/mismatched secret cookie.
→ `409 CONFLICT` — ticket isn't `WAITING` (illegal transition).

---

## Bookings — advance slot reservations (public + booking-secret cookie)

A separate flow from the same-day live queue: staff open dated/timed slots with a
capacity; students reserve one ahead of time instead of waiting live. On the day,
staff "check in" a booking, which converts it into a real `Ticket` via the exact
same atomic issuance path as a normal join — from that point it behaves like any
other live ticket (position, ETA, display board, stats).

Dedup: **one active (`BOOKED`) booking per student per service at a time**,
enforced by a partial unique index (`one_active_booking_per_student`), same
pattern as the ticket dedup rule. `studentId` is normalized (trim + uppercase)
before any dedup check, so `"ra123"` and `"RA123"` collide.

### `POST /api/slots/:id/bookings` — book a slot
Body: `{ holderName, studentId }`. Sets an httpOnly `bookingSecret` cookie (90-day).
→ `201 { data: { id, status: "BOOKED" } }`
→ `409 CONFLICT` — "This slot is full" (capacity check + insert is one atomic statement — proven race-free by `npm run booking-concurrency-test`).
→ `409 CONFLICT` — already has an active booking for this service.

### `GET /api/bookings/:id`
→ `{ data: { id, status, holderName, slot: { startsAt, endsAt }, service: { slug, name }, convertedTicketId } }`

### `DELETE /api/bookings/:id` — cancel
Requires the `bookingSecret` cookie. → `{ data: { ok: true } }` · `403 FORBIDDEN` without it · `409 CONFLICT` if not `BOOKED`.

### `POST /api/bookings/:id/reschedule`
Body: `{ newSlotId }`. Requires the `bookingSecret` cookie. Moves the *same* booking to a new slot (not a new row — a fresh insert would collide with the dedup index while the original is still `BOOKED`) via two atomic steps: claim new slot capacity, then move the booking, undoing the claim if the booking turns out not to be active anymore.
→ `{ data: { id, status: "BOOKED" } }`
→ `409 CONFLICT` — "That slot is full — pick another time" (original booking is left untouched on failure).

---

## Staff (`requireRole(['STAFF','ADMIN'])` on every route)

### `GET /api/staff/services/:id/tickets`
The staff console's data source — unlike the public endpoints, exposes ticket IDs so staff can act on them.
→ `{ data: { service: { id, slug, name, status }, called: TicketSummary | null, waiting: TicketSummary[] } }`
where `TicketSummary = { id, tokenLabel, tokenNumber, holderName, studentId, status }`.

### `POST /api/staff/services/:id/call-next`
→ `{ data: { id, tokenLabel, tokenNumber, status: "CALLED", holderName } }`
→ `409 CONFLICT` — a ticket is already `CALLED` (resolve it first) or nobody is `WAITING`.
→ `401`/`403` per `requireRole`.

### `PATCH /api/staff/tickets/:id`
Body: `{ action: "SERVE" | "NO_SHOW" | "RECALL" }`
→ `{ data: { id, status } }`
→ `409 CONFLICT` on any transition not in the state machine (`WAITING→CALLED→SERVED`, `WAITING→CANCELLED`, `CALLED→NO_SHOW`, `CALLED→WAITING` for recall).

### `PATCH /api/staff/services/:id/status`
Body: `{ status: "OPEN" | "PAUSED" | "CLOSED" }`
→ `{ data: { id, status } }`

### `POST /api/staff/services/:id/slots` — create one slot
Body: `{ startsAt, endsAt (ISO datetimes), capacity }` → `201 { data: <slot> }` · `409 CONFLICT` on duplicate `startsAt` for that service.

### `POST /api/staff/services/:id/slots/bulk` — generate slots over a date range
Body: `{ startDate, endDate (YYYY-MM-DD), daysOfWeek: number[] (0=Sun), dailyStartTime, dailyEndTime (HH:MM), slotMinutes, capacity }`
→ `{ data: { created, attempted } }`. Idempotent — reruns skip slots that already exist (`skipDuplicates`, backed by the `(serviceId, startsAt)` unique index).

### `GET /api/staff/services/:id/slots?from=&to=` (ISO datetimes)
→ `{ data: [{ id, startsAt, endsAt, capacity, bookedCount }] }` — feeds the staff calendar.

### `DELETE /api/staff/slots/:id`
→ `{ data: { ok: true } }` · `409 CONFLICT` if it has any bookings (cancel them first).

### `GET /api/staff/services/:id/bookings?date=YYYY-MM-DD`
→ `{ data: [{ id, holderName, studentId, status, startsAt, endsAt, updatedAt }] }` — every booking for that day regardless of status, so staff can see student-made changes (cancellations, etc.), not just active ones.

### `PATCH /api/staff/bookings/:id`
Body: `{ action: "CHECK_IN" | "NO_SHOW" | "CANCEL" }`.
`CHECK_IN` converts the booking into a real live-queue `Ticket` (same atomic counter-increment + insert as a normal join) and returns `{ data: { id, status: "CONVERTED", ticketId } }`. `NO_SHOW`/`CANCEL` release the slot's capacity and return `{ data: { id, status } }`.
→ `409 CONFLICT` on an illegal transition, or if `CHECK_IN` is attempted while the queue isn't `OPEN`.

### `GET /api/staff/stats`
→
```json
{
  "data": {
    "today": { "issued": 0, "served": 0, "cancelled": 0, "noShow": 0, "waiting": 0 },
    "hourly": [{ "hour": 0, "count": 0 }, ... 24 entries],
    "perService": [{
      "slug": "cert", "name": "Certificate Desk", "code": "CERT",
      "waitingNow": 0,
      "issuedTotal": 0, "servedTotal": 0, "cancelledTotal": 0, "noShowTotal": 0,
      "avgWaitSecs": 0, "avgServiceSecs": 0
    }]
  }
}
```
`hourly` and `perService` aggregate the last 6 days (seed history + today) so the charts aren't empty on a fresh demo day; `today` is today-only.

---

## Admin (`requireRole(['ADMIN'])` only)

### `POST /api/admin/services`
Body: `{ slug, name, code, description?, location? }` → `201 { data: <service> }`
→ `409 CONFLICT` on duplicate slug.

### `PATCH /api/admin/services/:id`
Body: any subset of the create fields + `isActive?: boolean` → `{ data: <service> }`

---

## Seeded demo accounts (password for all: `queueup123`)

| Role  | Email |
|---|---|
| ADMIN | admin@queueup.demo |
| STAFF | staff.cert@queueup.demo |
| STAFF | staff.it@queueup.demo |
| STAFF | staff.lab@queueup.demo |

Services: `cert` (Certificate Desk), `it` (IT Help Desk), `lab` (Lab Equipment Booking).
