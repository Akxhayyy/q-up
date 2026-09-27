"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { apiGet } from "@/lib/api-client";

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "STAFF" | "ADMIN";
};

/** Redirects to /staff/login if unauthenticated, or "/" if role isn't allowed. Real enforcement is server-side (requireRole); this is just UX gating. */
export function useSession(allowedRoles: SessionUser["role"][]) {
  const router = useRouter();
  const { data, error, isLoading } = useSWR<SessionUser>("/api/me", apiGet, {
    shouldRetryOnError: false,
  });

  useEffect(() => {
    if (isLoading) return;
    if (error || !data) {
      router.replace("/staff/login");
      return;
    }
    if (!allowedRoles.includes(data.role)) {
      router.replace("/");
    }
  }, [data, error, isLoading, allowedRoles, router]);

  return { user: data, isLoading: isLoading || (!data && !error) };
}
