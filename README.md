# Q-Up — Campus Queue Manager

A digital token-queue system for high-demand campus services (certificate desk, IT help desk, lab equipment booking). Students join a queue from their phone with no signup, watch their position update live, and get called by staff — plus an optional advance-booking calendar for busy days.

Built for the **Vision2Web Full Stack Web Development Hackathon** (Theme 1, #4 — Campus Queue Manager).

## The five graded core features

| Feature | Where |
|---|---|
| Service queues | `/` (landing), `/q/[slug]` (join) |
| Token generation | Atomic single-statement issuance — see [Key technical decisions](#key-technical-decisions) |
| Staff controls | `/staff/[id]` — Call Next / Served / No-show / Recall / Pause / Resume / Close |
| Live position | `/t/[id]` — polls every 3s, no refresh needed |
| Queue statistics | `/admin` — hourly histogram, per-service comparison, KPI tiles |

**Bonus:** an advance-booking subsystem (staff open dated/timed slots with capacity; students reserve ahead of time instead of waiting live; staff "check in" a booking on the day, converting it into a real ticket) — plus light/dark mode, an audit log of every staff/student change, and a projector display board with a QR code.

## Surfaces

- **Student** (mobile-first, no signup) — `/` browse services → `/q/[slug]` join or `/book/[slug]` reserve a future slot → `/t/[id]` live ticket / `/booking/[id]` manage a reservation
- **Staff console** (desktop, login required) — `/staff/login` → `/staff/[id]` run a queue, `/staff/[id]/slots` manage bookings and availability
- **Admin** (login required) — `/admin` — stats dashboard + service management
- **Display board** (no auth, projector) — `/display/[slug]` — huge "NOW SERVING", QR code to join

## Tech stack

Next.js 16 (App Router, TypeScript) · Prisma 7 + Neon Postgres (via `@prisma/adapter-neon`, driver-adapter architecture) · Zod · Tailwind v4 + shadcn/ui (Base UI) · SWR (3s polling) · Recharts · `motion` for animation · Vercel-ready.

## Getting started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up your database.** Create a [Neon](https://neon.tech) project and copy both connection strings (pooled and direct) into `.env`:
   ```bash
   DATABASE_URL="postgresql://...-pooler...?sslmode=require&channel_binding=require"
   DIRECT_URL="postgresql://... (same host, without -pooler) ...?sslmode=require&channel_binding=require"
   ```

3. **Migrate and seed:**
   ```bash
   npx prisma migrate deploy
   npm run seed
   ```

4. **Run it:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

### Demo accounts (password for all: `queueup123`)

| Role | Email |
|---|---|
| ADMIN | `admin@queueup.demo` |
| STAFF | `staff.cert@queueup.demo` |
| STAFF | `staff.it@queueup.demo` |
| STAFF | `staff.lab@queueup.demo` |

Seeded services: `cert` (Certificate Desk), `it` (IT Help Desk), `lab` (Lab Equipment Booking).

### Demoing on a phone

The dev server listens on all network interfaces. With your phone on the same WiFi as this machine, find this machine's LAN IP (e.g. `ipconfig` on Windows, `ifconfig`/`ip addr` on Mac/Linux — look for a `192.168.x.x` or `10.x.x.x` address, not `169.254.x.x`) and open `http://<that-ip>:3000` on the phone, or scan the QR code shown on `/display/[slug]` with the phone's camera — it encodes whatever address is currently serving the page, so it just works once you're viewing the display board from the right address.

## Scripts

```bash
npm run dev                       # local dev server
npm run build                     # production build (must pass clean)
npx tsc --noEmit                  # typecheck (must pass clean)
npm run seed                      # wipe + reseed demo data (idempotent — run before every demo)
npm run concurrency-test          # 100 parallel joins -> 100 unique, gap-free tokens
npm run booking-concurrency-test  # N students race for a capacity-K slot -> exactly K win
```

## Key technical decisions

**Token issuance is one atomic SQL statement**, not a `COUNT(*)` or read-then-write:
```sql
UPDATE "services"
SET "lastTokenNumber" = CASE WHEN "tokenDate" = CURRENT_DATE THEN "lastTokenNumber" + 1 ELSE 1 END,
    "tokenDate" = CURRENT_DATE
WHERE id = $1 AND status = 'OPEN'
RETURNING "lastTokenNumber", "tokenDate"
```
Combined with the `Ticket` insert in a single CTE. Proven race-free by `npm run concurrency-test`: 100 simultaneous joins produce 100 unique, gap-free tokens, not duplicates or 500s. The same pattern secures booking-slot capacity (`npm run booking-concurrency-test`).

**One active ticket per student per service per day is enforced by the database**, via a partial unique index (`WHERE status IN ('WAITING','CALLED')`) — not an app-level pre-check, which a race condition could slip past. The booking subsystem has the same invariant (`WHERE status = 'BOOKED'`), with student IDs normalized (trim + uppercase) so `"ra123"` and `"RA123"` can't be used to dodge it.

**The ticket/booking state machines live in one server-side function each** (`lib/queue.ts`). Any transition not explicitly listed is a `409 CONFLICT`. The client-supplied role or ticket ID is never trusted — every staff mutation checks `requireRole()` server-side, and cancelling a ticket/booking requires an httpOnly secret cookie issued at join/booking time, checked against a server-side hash.

**Live updates are SWR polling at 3 seconds, not WebSockets.** Vercel's serverless functions can't hold persistent connections, and at this granularity a second always-on server buys no visible improvement over polling an indexed `COUNT`.

**One error envelope everywhere:**
```json
{ "error": { "code": "CONFLICT", "message": "...", "details": { "field": ["reason"] } } }
```
See `docs/api-contract.md` for the full endpoint reference.

## Project structure

```
prisma/          schema, migrations, seed script
lib/             validators (Zod), auth, prisma client, queue/booking state machines
app/api/         all REST routes
app/(student)/   landing, join, ticket, booking calendar/detail
app/staff/       login, console, slot management
app/admin/       stats dashboard, service management
app/display/     projector board
scripts/         concurrency test scripts
docs/            API contract
```
