"use client";

import Link from "next/link";
import useSWR from "swr";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, ApiError } from "@/lib/api-client";
import { springs, motionTokens } from "@/lib/motion-tokens";

type Service = {
  id: string;
  slug: string;
  name: string;
  code: string;
  description: string | null;
  location: string | null;
  status: "OPEN" | "PAUSED" | "CLOSED";
  waitingCount: number;
  etaSeconds: number;
  nowServing: string | null;
};

const STATUS_BADGE: Record<Service["status"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  OPEN: { label: "Open", variant: "default" },
  PAUSED: { label: "Paused", variant: "secondary" },
  CLOSED: { label: "Closed", variant: "outline" },
};

function formatEta(seconds: number): string {
  if (seconds < 60) return "<1 min";
  return `~${Math.round(seconds / 60)} min`;
}

export function ServiceList() {
  const { data, error, isLoading } = useSWR<Service[]>("/api/services", apiGet, {
    refreshInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {error instanceof ApiError ? error.message : "Couldn't load services. Try refreshing."}
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No services are available right now.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.map((service, i) => {
        const badge = STATUS_BADGE[service.status];
        const joinable = service.status === "OPEN";
        const Card = (
          <motion.div
            initial={{ opacity: 0, y: motionTokens.distance.md }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.gentle, delay: i * 0.06 }}
            whileHover={joinable ? { scale: motionTokens.scale.pop } : undefined}
            whileTap={joinable ? { scale: motionTokens.scale.press } : undefined}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{service.name}</h2>
                {service.location && (
                  <p className="text-xs text-muted-foreground">{service.location}</p>
                )}
              </div>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
            <div className="mt-4 flex items-center gap-4 text-sm">
              <span className="font-medium">{service.waitingCount} waiting</span>
              <span className="text-muted-foreground">{formatEta(service.etaSeconds)} wait</span>
              {service.nowServing && (
                <span className="text-muted-foreground">Now serving {service.nowServing}</span>
              )}
            </div>
            {!joinable && (
              <p className="mt-2 text-xs text-muted-foreground">
                {service.status === "PAUSED"
                  ? "This queue is temporarily paused — check back soon."
                  : "This queue is closed for today."}
              </p>
            )}
          </motion.div>
        );

        return joinable ? (
          <Link key={service.id} href={`/q/${service.slug}`} className="block">
            {Card}
          </Link>
        ) : (
          <div key={service.id}>{Card}</div>
        );
      })}
    </div>
  );
}
