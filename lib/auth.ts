import "server-only";
import { cookies } from "next/headers";
import { randomBytes, createHash, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/app/generated/prisma/client";

const SESSION_COOKIE = "queueup_session";
const TICKET_SECRET_COOKIE_PREFIX = "queueup_ticket_";
const BOOKING_SECRET_COOKIE_PREFIX = "queueup_booking_";

// ---- Staff/admin sessions ----
// Minimal signed session: base64(userId).hmac. No external session store needed
// for a 2-day hackathon; good enough to prove server-side role enforcement.

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me";

function sign(value: string): string {
  return createHash("sha256").update(`${value}:${SESSION_SECRET}`).digest("hex");
}

function encodeSession(userId: string): string {
  const payload = Buffer.from(userId, "utf8").toString("base64url");
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function decodeSession(token: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    return Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = decodeSession(token);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export class AuthError extends Error {
  constructor(
    public status: 401 | 403,
    message: string
  ) {
    super(message);
  }
}

/** Throws AuthError(401|403) — callers should catch and route into the error envelope. */
export async function requireRole(
  _req: NextRequest,
  roles: Role[]
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError(401, "Authentication required");
  if (!roles.includes(user.role)) throw new AuthError(403, "Insufficient permissions");
  return user;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

// ---- Student ticket secrets ----
// Joining a queue returns a random secret; only its hash is stored on the Ticket row.
// The raw secret lives in an httpOnly cookie scoped by ticket id, so the ticket id
// alone is never sufficient to cancel — the caller must hold the matching cookie.

export function generateTicketSecret(): string {
  return randomBytes(24).toString("base64url");
}

export function hashTicketSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export async function setTicketSecretCookie(ticketId: string, secret: string) {
  const store = await cookies();
  store.set(`${TICKET_SECRET_COOKIE_PREFIX}${ticketId}`, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours — comfortably covers a queue's open hours
  });
}

export async function getTicketSecretFromCookie(ticketId: string): Promise<string | null> {
  const store = await cookies();
  return store.get(`${TICKET_SECRET_COOKIE_PREFIX}${ticketId}`)?.value ?? null;
}

export function ticketSecretMatches(rawSecret: string, storedHash: string): boolean {
  const candidateHash = hashTicketSecret(rawSecret);
  const a = Buffer.from(candidateHash);
  const b = Buffer.from(storedHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---- Booking secrets ----
// Same mechanism as ticket secrets (generateTicketSecret/hashTicketSecret are
// generic already), just a separate cookie namespace and a much longer
// lifetime — a booking can be for weeks out, unlike a same-day ticket.

export async function setBookingSecretCookie(bookingId: string, secret: string) {
  const store = await cookies();
  store.set(`${BOOKING_SECRET_COOKIE_PREFIX}${bookingId}`, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90 days
  });
}

export async function getBookingSecretFromCookie(bookingId: string): Promise<string | null> {
  const store = await cookies();
  return store.get(`${BOOKING_SECRET_COOKIE_PREFIX}${bookingId}`)?.value ?? null;
}
