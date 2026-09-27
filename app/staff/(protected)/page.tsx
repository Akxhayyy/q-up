"use client";

import Link from "next/link";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, ApiError } from "@/lib/api-client";

type Service = {
  id: string;
  slug: string;
  name: string;
  status: "OPEN" | "PAUSED" | "CLOSED";
  waitingCount: number;
  nowServing: string | null;
};

export default function StaffHomePage() {
  const { data, error, isLoading } = useSWR<Service[]>("/api/services", apiGet, {
    refreshInterval: 3000,
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight">Choose a service to run</h1>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {error instanceof ApiError ? error.message : "Couldn't load services."}
        </p>
      )}

      {data && data.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No services configured yet.
        </p>
      )}

      {data && data.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.map((s) => (
            <Link
              key={s.id}
              href={`/staff/${s.id}`}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-muted"
            >
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-muted-foreground">
                  {s.waitingCount} waiting
                  {s.nowServing ? ` · now serving ${s.nowServing}` : ""}
                </p>
              </div>
              <Badge variant={s.status === "OPEN" ? "default" : "secondary"}>{s.status}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
