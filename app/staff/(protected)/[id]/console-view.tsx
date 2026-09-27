"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, ApiError } from "@/lib/api-client";
import { springs } from "@/lib/motion-tokens";

type TicketSummary = {
  id: string;
  tokenLabel: string;
  tokenNumber: number;
  holderName: string;
  studentId: string;
  status: string;
};

type ConsoleData = {
  service: { id: string; slug: string; name: string; status: "OPEN" | "PAUSED" | "CLOSED" };
  called: TicketSummary | null;
  waiting: TicketSummary[];
};

export function ConsoleView({ serviceId }: { serviceId: string }) {
  const { data, error, isLoading, mutate } = useSWR<ConsoleData>(
    `/api/staff/services/${serviceId}/tickets`,
    apiGet,
    { refreshInterval: 3000 }
  );
  const [busy, setBusy] = useState(false);

  async function callNext() {
    setBusy(true);
    try {
      await apiSend(`/api/staff/services/${serviceId}/call-next`, "POST");
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function ticketAction(ticketId: string, action: "SERVE" | "NO_SHOW" | "RECALL") {
    setBusy(true);
    try {
      await apiSend(`/api/staff/tickets/${ticketId}`, "PATCH", { action });
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "OPEN" | "PAUSED" | "CLOSED") {
    setBusy(true);
    try {
      await apiSend(`/api/staff/services/${serviceId}/status`, "PATCH", { status });
      mutate();
      toast.success(`Queue ${status === "OPEN" ? "opened" : status === "PAUSED" ? "paused" : "closed"}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">
          {error instanceof ApiError ? error.message : "Couldn't load this service."}
        </p>
      </div>
    );
  }

  const { service, called, waiting } = data;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-5 sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{service.name}</h1>
          <p className="text-sm text-muted-foreground">{waiting.length} waiting</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <a href={`/display/${service.slug}`} target="_blank" rel="noopener noreferrer">
                Display board
              </a>
            }
          />
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/staff/${service.id}/slots`}>Manage bookings</Link>}
          />
          <Badge variant={service.status === "OPEN" ? "default" : "secondary"}>{service.status}</Badge>
        </div>
      </div>

      {/* Status controls */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={service.status === "OPEN" ? "secondary" : "outline"}
          disabled={busy || service.status === "OPEN"}
          onClick={() => setStatus("OPEN")}
        >
          Resume / Open
        </Button>
        <Button
          size="sm"
          variant={service.status === "PAUSED" ? "secondary" : "outline"}
          disabled={busy || service.status === "PAUSED"}
          onClick={() => setStatus("PAUSED")}
        >
          Pause
        </Button>
        <Button
          size="sm"
          variant={service.status === "CLOSED" ? "secondary" : "outline"}
          disabled={busy || service.status === "CLOSED"}
          onClick={() => setStatus("CLOSED")}
        >
          Close
        </Button>
      </div>

      {/* Now serving */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Now serving</p>
        <AnimatePresence mode="wait">
          {called ? (
            <motion.div
              key={called.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={springs.snappy}
              className="mt-2 flex flex-col gap-4"
            >
              <div>
                <p className="font-mono text-4xl font-bold">{called.tokenLabel}</p>
                <p className="text-sm text-muted-foreground">{called.holderName}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => ticketAction(called.id, "SERVE")}>
                  Served
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => ticketAction(called.id, "NO_SHOW")}
                >
                  No-show
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => ticketAction(called.id, "RECALL")}
                >
                  Recall (back to waiting)
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-2 flex flex-col gap-4"
            >
              <p className="text-sm text-muted-foreground">No one is currently being called.</p>
              <Button
                disabled={busy || waiting.length === 0}
                onClick={callNext}
                className="w-fit"
              >
                Call next
              </Button>
              {waiting.length === 0 && (
                <p className="text-xs text-muted-foreground">Nobody is waiting right now.</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Waiting list */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Waiting ({waiting.length})
        </p>
        {waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is waiting.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {waiting.map((t, i) => (
              <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-mono font-medium">{t.tokenLabel}</span>
                <span className="text-muted-foreground">{t.holderName}</span>
                {i === 0 && <Badge variant="outline">Next</Badge>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
