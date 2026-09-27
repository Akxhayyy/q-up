import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { withErrorHandling, unauthenticated } from "@/lib/api-response";

export const GET = withErrorHandling(async () => {
  const user = await getSessionUser();
  if (!user) return unauthenticated();
  return NextResponse.json({ data: user });
});
