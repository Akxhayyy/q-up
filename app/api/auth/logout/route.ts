import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-response";

export const POST = withErrorHandling(async () => {
  await destroySession();
  return NextResponse.json({ data: { ok: true } });
});
