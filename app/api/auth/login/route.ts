import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators";
import { verifyPassword, createSession } from "@/lib/auth";
import { withErrorHandling, jsonError } from "@/lib/api-response";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = loginSchema.parse(await req.json());

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return jsonError(401, "UNAUTHENTICATED", "Invalid email or password");
  }

  await createSession(user.id);

  return NextResponse.json({
    data: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});
