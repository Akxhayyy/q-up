import "dotenv/config";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  Role,
  ServiceStatus,
  TicketStatus,
  type Prisma,
} from "../app/generated/prisma/client";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}

/** Hour of day biased toward the lunchtime rush, 9am-5pm workday. */
function weightedHour(): number {
  const weighted = [9, 10, 10, 11, 11, 12, 12, 12, 12, 13, 13, 13, 13, 14, 14, 15, 16];
  return pick(weighted);
}

// All date math here is done in UTC, not local time, because Postgres's
// CURRENT_DATE (used by the atomic token-issuance UPDATE) is evaluated in the
// database's UTC session timezone. Using local-time midnight would shift the
// stored @db.Date value to the wrong day for anyone running this west of UTC
// or, as observed during this build (IST, UTC+5:30), east of it too — local
// midnight is still the previous UTC day whenever the offset is positive.
function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysAgo(n: number): Date {
  const d = startOfDay(new Date());
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function atHourMinute(day: Date, hour: number, minute: number): Date {
  const d = new Date(day);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

type ServiceSeed = {
  slug: string;
  name: string;
  code: string;
  description: string;
  location: string;
  avgServiceSecs: number;
  serviceDurationMinutes: [number, number];
};

const SERVICES: ServiceSeed[] = [
  {
    slug: "cert",
    name: "Certificate Desk",
    code: "CERT",
    description: "Bonafide, transcript, and degree certificate requests.",
    location: "Admin Block, Room 12",
    avgServiceSecs: 240,
    serviceDurationMinutes: [2, 6],
  },
  {
    slug: "it",
    name: "IT Help Desk",
    code: "IT",
    description: "Laptop, Wi-Fi, and campus account support.",
    location: "IT Building, Ground Floor",
    avgServiceSecs: 480,
    serviceDurationMinutes: [5, 15],
  },
  {
    slug: "lab",
    name: "Lab Equipment Booking",
    code: "LAB",
    description: "Checkout and return of shared lab equipment.",
    location: "Engineering Block, Lab 3",
    avgServiceSecs: 600,
    serviceDurationMinutes: [8, 20],
  },
];

const STAFF_LOGINS = [
  { name: "Ada Admin", email: "admin@queueup.demo", role: Role.ADMIN },
  { name: "Sam Certificate", email: "staff.cert@queueup.demo", role: Role.STAFF },
  { name: "Priya IT", email: "staff.it@queueup.demo", role: Role.STAFF },
  { name: "Leo Lab", email: "staff.lab@queueup.demo", role: Role.STAFF },
] as const;

const DEMO_PASSWORD = "queueup123";

async function main() {
  console.log("Wiping existing data...");
  await prisma.queueEvent.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.serviceSlot.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();

  console.log("Seeding users...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await prisma.user.createMany({
    data: STAFF_LOGINS.map((u) => ({
      name: u.name,
      email: u.email,
      passwordHash,
      role: u.role,
    })),
  });

  console.log("Seeding services...");
  const today = startOfDay(new Date());
  const services = await Promise.all(
    SERVICES.map((s) =>
      prisma.service.create({
        data: {
          slug: s.slug,
          name: s.name,
          code: s.code,
          description: s.description,
          location: s.location,
          status: ServiceStatus.OPEN,
          avgServiceSecs: s.avgServiceSecs,
          lastTokenNumber: 0,
          tokenDate: today,
          isActive: true,
        },
      })
    )
  );

  console.log("Seeding historical tickets (previous 5 days)...");
  let historicalCount = 0;
  for (const service of services) {
    const config = SERVICES.find((s) => s.slug === service.slug)!;
    for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
      const day = daysAgo(dayOffset);
      const ticketsToday = randomInt(6, 10);
      const data: Prisma.TicketCreateManyInput[] = [];

      for (let tokenNumber = 1; tokenNumber <= ticketsToday; tokenNumber++) {
        const issuedAt = atHourMinute(day, weightedHour(), randomInt(0, 59));
        const roll = Math.random();

        if (roll < 0.78) {
          // SERVED
          const waitMinutes = randomInt(2, 25);
          const calledAt = new Date(issuedAt.getTime() + waitMinutes * 60_000);
          const [min, max] = config.serviceDurationMinutes;
          const serviceMinutes = randomInt(min, max);
          const servedAt = new Date(calledAt.getTime() + serviceMinutes * 60_000);
          data.push({
            serviceId: service.id,
            tokenNumber,
            tokenDate: day,
            holderName: `Student ${dayOffset}-${tokenNumber}`,
            studentId: `STU${dayOffset}${service.code}${String(tokenNumber).padStart(3, "0")}`,
            secretHash: "seed-data-not-cancellable",
            status: TicketStatus.SERVED,
            issuedAt,
            calledAt,
            servedAt,
            closedAt: null,
          });
        } else if (roll < 0.9) {
          // CANCELLED — never called
          const waitMinutes = randomInt(1, 20);
          const closedAt = new Date(issuedAt.getTime() + waitMinutes * 60_000);
          data.push({
            serviceId: service.id,
            tokenNumber,
            tokenDate: day,
            holderName: `Student ${dayOffset}-${tokenNumber}`,
            studentId: `STU${dayOffset}${service.code}${String(tokenNumber).padStart(3, "0")}`,
            secretHash: "seed-data-not-cancellable",
            status: TicketStatus.CANCELLED,
            issuedAt,
            calledAt: null,
            servedAt: null,
            closedAt,
          });
        } else {
          // NO_SHOW — called but never served
          const waitMinutes = randomInt(2, 25);
          const calledAt = new Date(issuedAt.getTime() + waitMinutes * 60_000);
          const graceMinutes = randomInt(2, 10);
          const closedAt = new Date(calledAt.getTime() + graceMinutes * 60_000);
          data.push({
            serviceId: service.id,
            tokenNumber,
            tokenDate: day,
            holderName: `Student ${dayOffset}-${tokenNumber}`,
            studentId: `STU${dayOffset}${service.code}${String(tokenNumber).padStart(3, "0")}`,
            secretHash: "seed-data-not-cancellable",
            status: TicketStatus.NO_SHOW,
            issuedAt,
            calledAt,
            servedAt: null,
            closedAt,
          });
        }
      }

      await prisma.ticket.createMany({ data });
      historicalCount += data.length;
    }
  }
  console.log(`  ${historicalCount} historical tickets created.`);

  console.log("Seeding today's waiting queue...");
  const waitingCounts: Record<string, number> = { cert: 3, it: 3, lab: 2 };
  const now = new Date();
  for (const service of services) {
    const count = waitingCounts[service.slug] ?? 3;
    const data: Prisma.TicketCreateManyInput[] = [];
    for (let tokenNumber = 1; tokenNumber <= count; tokenNumber++) {
      const minutesAgo = randomInt(2, 45) * (count - tokenNumber + 1);
      const issuedAt = new Date(now.getTime() - minutesAgo * 60_000);
      data.push({
        serviceId: service.id,
        tokenNumber,
        tokenDate: today,
        holderName: `Student T-${tokenNumber}`,
        studentId: `STU-TODAY-${service.code}-${tokenNumber}`,
        secretHash: "seed-data-not-cancellable",
        status: TicketStatus.WAITING,
        issuedAt,
        calledAt: null,
        servedAt: null,
        closedAt: null,
      });
    }
    await prisma.ticket.createMany({ data });
    await prisma.service.update({
      where: { id: service.id },
      data: { lastTokenNumber: count, tokenDate: today },
    });
  }

  console.log("Seed complete.");
  console.log("\nStaff logins (password for all: queueup123):");
  for (const u of STAFF_LOGINS) {
    console.log(`  ${u.role.padEnd(6)} ${u.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
