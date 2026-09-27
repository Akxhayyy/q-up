/**
 * Generates a QR code PNG for every active service's join page and saves
 * them to qr-codes/<slug>.png. The live display board (/display/[slug])
 * already generates its own QR in-browser from window.location.origin, so
 * it always matches whatever host is serving it — these static files exist
 * purely for convenience (printing, pasting into slides, sharing a link
 * without opening the app).
 *
 * The base URL is NOT auto-detected on purpose: run this again with the
 * correct BASE_URL right before the real demo (once you know the venue's
 * network or the production Vercel URL) — a QR baked with today's LAN IP
 * will be wrong on a different network.
 *
 * Usage:
 *   BASE_URL=http://192.168.1.15:3000 npx tsx scripts/generate-qr-codes.ts
 *   BASE_URL=https://your-app.vercel.app npx tsx scripts/generate-qr-codes.ts
 */
import "dotenv/config";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import QRCode from "qrcode";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { PrismaClient } from "../app/generated/prisma/client";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.join(__dirname, "..", "qr-codes");

async function main() {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });

  if (services.length === 0) {
    console.log("No active services found — did you run `npm run seed`?");
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Generating QR codes for base URL: ${BASE_URL}\n`);

  for (const service of services) {
    const url = `${BASE_URL}/q/${service.slug}`;
    const filePath = path.join(OUT_DIR, `${service.slug}.png`);
    const buffer = await QRCode.toBuffer(url, {
      width: 512,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
    await writeFile(filePath, buffer);
    console.log(`  ${service.name.padEnd(24)} -> qr-codes/${service.slug}.png  (${url})`);
  }

  console.log(`\nDone. ${services.length} QR code(s) written to qr-codes/.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
