"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, ApiError } from "@/lib/api-client";
import { springs, motionTokens } from "@/lib/motion-tokens";
import { motionConfig } from "@/lib/motion-config";

type TicketStatus = "WAITING" | "CALLED" | "SERVED" | "CANCELLED" | "NO_SHOW";

type TicketData = {
  id: string;
  tokenLabel: string;
  tokenNumber: number;
  status: TicketStatus;
  position: number;
  etaSeconds: number;
  service: { slug: string; name: string };
};

function formatEta(seconds: number): string {
  if (seconds <= 0) return "any moment now";
  if (seconds < 60) return "less than a minute";
  const mins = Math.round(seconds / 60);
  return `~${mins} min`;
}

function playChime() {
  try {
    type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const w = window as WebkitWindow;
    const Ctx = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.7);
  } catch {
    // Web Audio not available — non-essential, fail silently.
  }
}

const STATUS_COPY: Record<TicketStatus, { title: string; tone: string }> = {
  WAITING: { title: "In queue", tone: "text-muted-foreground" },
  CALLED: { title: "You're being called!", tone: "text-success" },
  SERVED: { title: "You've been served", tone: "text-muted-foreground" },
  CANCELLED: { title: "Ticket cancelled", tone: "text-muted-foreground" },
  NO_SHOW: { title: "Marked as no-show", tone: "text-muted-foreground" },
};

export function TicketView({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useSWR<TicketData>(`/api/tickets/${id}`, apiGet, {
    refreshInterval: 3000,
  });
  const [cancelling, setCancelling] = useState(false);
  const prevStatus = useRef<TicketStatus | null>(null);

  useEffect(() => {
    if (!data) return;
    if (prevStatus.current && prevStatus.current !== "CALLED" && data.status === "CALLED") {
      if (motionConfig.shouldAnimate({ essential: true })) playChime();
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([200, 100, 200]);
      toast.success("You're being called — head over now!");
    }
    prevStatus.current = data.status;
  }, [data?.status]);

  async function handleCancel() {
    setCancelling(true);
    try {
      await apiSend(`/api/tickets/${id}`, "DELETE");
      toast.success("Ticket cancelled");
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setCancelling(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-28 w-64" />
        <Skeleton className="h-4 w-56" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-lg font-semibold">
          {error instanceof ApiError ? error.message : "Couldn't load your ticket"}
        </p>
        <p className="text-sm text-muted-foreground">
          The link may be wrong, or this ticket no longer exists.
        </p>
        <Button variant="outline" nativeButton={false} render={<Link href="/">Back to services</Link>} />
      </div>
    );
  }

  const copy = STATUS_COPY[data.status];
  const isWaiting = data.status === "WAITING";
  const isCalled = data.status === "CALLED";
  const isNext = isWaiting && data.position === 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-10 text-center">
      <p className="text-sm font-medium text-muted-foreground">{data.service.name}</p>

      <motion.div
        className="relative flex flex-col items-center gap-3"
        animate={
          isCalled && motionConfig.shouldAnimate()
            ? { scale: [1, 1.03, 1] }
            : { scale: 1 }
        }
        transition={isCalled ? { duration: 1.6, repeat: Infinity, ease: motionTokens.easing.smooth } : undefined}
      >
        {isCalled && (
          <div
            aria-hidden
            className="absolute inset-0 -z-10 rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(circle, var(--gradient-from) 0%, transparent 70%)",
              opacity: 0.35,
            }}
          />
        )}
        <div
          className="rounded-3xl px-6 py-6 font-mono text-4xl font-bold tracking-tight whitespace-nowrap sm:px-10 sm:py-8 sm:text-6xl md:text-7xl"
          style={{
            background: isCalled
              ? "linear-gradient(135deg, var(--gradient-from), var(--gradient-via), var(--gradient-to))"
              : undefined,
            WebkitBackgroundClip: isCalled ? "text" : undefined,
            backgroundClip: isCalled ? "text" : undefined,
            color: isCalled ? "transparent" : "var(--foreground)",
          }}
        >
          {data.tokenLabel}
        </div>
      </motion.div>

      <p className={`text-lg font-semibold ${copy.tone}`}>{copy.title}</p>

      {isWaiting && (
        <div className="flex flex-col items-center gap-2">
          <AnimatePresence mode="popLayout">
            <motion.p
              key={data.position}
              initial={{ opacity: 0, y: motionTokens.distance.md, scale: motionTokens.scale.subtle }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -motionTokens.distance.md }}
              transition={springs.gentle}
              className="text-4xl font-bold"
            >
              {isNext ? "You're next!" : data.position}
            </motion.p>
          </AnimatePresence>
          {!isNext && (
            <p className="text-sm text-muted-foreground">
              {data.position} {data.position === 1 ? "person" : "people"} ahead of you
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Estimated wait: {formatEta(data.etaSeconds)}{" "}
            <span className="opacity-70">(approximate)</span>
          </p>
        </div>
      )}

      {isCalled && (
        <p className="max-w-xs text-sm text-muted-foreground">
          Please head to the counter now. Staff are ready for you.
        </p>
      )}

      <div className="flex flex-col items-center gap-2">
        <Button
          variant="outline"
          disabled={!isWaiting || cancelling}
          onClick={handleCancel}
          className="min-w-40"
        >
          {cancelling ? "Cancelling…" : "Cancel ticket"}
        </Button>
        {!isWaiting && (
          <p className="text-xs text-muted-foreground">
            {isCalled
              ? "Can't cancel once you've been called."
              : "This ticket is no longer active."}
          </p>
        )}
      </div>
    </div>
  );
}
