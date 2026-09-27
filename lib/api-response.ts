import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth";
import { QueueConflictError } from "@/lib/queue";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type ErrorEnvelope = {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, string[]>;
  };
};

function errorBody(code: ErrorCode, message: string, details?: Record<string, string[]>): ErrorEnvelope {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

export function jsonError(
  status: number,
  code: ErrorCode,
  message: string,
  details?: Record<string, string[]>
): NextResponse<ErrorEnvelope> {
  return NextResponse.json(errorBody(code, message, details), { status });
}

export function badRequest(details: Record<string, string[]>, message = "Validation failed") {
  return jsonError(400, "VALIDATION_ERROR", message, details);
}

export function unauthenticated(message = "Authentication required") {
  return jsonError(401, "UNAUTHENTICATED", message);
}

export function forbidden(message = "Insufficient permissions") {
  return jsonError(403, "FORBIDDEN", message);
}

export function notFound(message = "Not found") {
  return jsonError(404, "NOT_FOUND", message);
}

export function conflict(message: string) {
  return jsonError(409, "CONFLICT", message);
}

export function rateLimited(message = "Too many requests") {
  return jsonError(429, "RATE_LIMITED", message);
}

/**
 * Wraps a route handler body so every thrown error — Zod, AuthError, or
 * anything unexpected — lands in the one error envelope shape instead of a
 * raw 500 with a stack trace reaching the client.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ZodError) {
        const details: Record<string, string[]> = {};
        for (const issue of err.issues) {
          const key = issue.path.join(".") || "_root";
          (details[key] ??= []).push(issue.message);
        }
        return badRequest(details);
      }
      if (err instanceof AuthError) {
        return jsonError(err.status, err.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", err.message);
      }
      if (err instanceof QueueConflictError) {
        return conflict(err.message);
      }
      console.error(err);
      return jsonError(500, "INTERNAL_ERROR", "Something went wrong");
    }
  };
}
