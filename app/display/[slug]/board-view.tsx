"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { AnimatePresence, motion } from "motion/react";
import QRCode from "react-qr-code";
import { apiGet } from "@/lib/api-client";
import { springs } from "@/lib/motion-tokens";

type ServiceBoard = {
  name: string;
  status: "OPEN" | "PAUSED" | "CLOSED";
  waitingCount: number;
  nowServing: string | null;
  upcoming: string[];
};

export function BoardView({ slug }: { slug: string }) {
  const { data } = useSWR<ServiceBoard>(`/api/services/${slug}`, apiGet, {
    refreshInterval: 3000,
  });
  const [joinUrl, setJoinUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setJoinUrl(`${window.location.origin}/q/${slug}`);
    }
  }, [slug]);

  return (
    <div className="theme-student flex min-h-screen flex-col bg-[oklch(0.14_0.02_300)] px-10 py-10 text-white sm:px-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white/70 sm:text-3xl">{data?.name ?? " "}</h1>
        {data && data.status !== "OPEN" && (
          <span className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white/70">
            {data.status === "PAUSED" ? "Paused" : "Closed"}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <p className="text-xl font-medium tracking-widest text-white/50 uppercase sm:text-2xl">
          Now serving
        </p>
        <AnimatePresence mode="wait">
          <motion.p
            key={data?.nowServing ?? "none"}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={springs.bouncy}
            className="font-mono text-8xl font-bold tracking-tight sm:text-9xl"
            style={{
              // Brighter, higher-lightness stops than the shared --gradient-*
              // tokens (which are tuned for the light ticket-page card) — on
              // a near-black projector background those read as neon instead
              // of muted.
              background: data?.nowServing
                ? "linear-gradient(135deg, oklch(0.75 0.24 328), oklch(0.78 0.2 380), oklch(0.82 0.19 55))"
                : undefined,
              WebkitBackgroundClip: data?.nowServing ? "text" : undefined,
              backgroundClip: data?.nowServing ? "text" : undefined,
              color: data?.nowServing ? "transparent" : "rgba(255,255,255,0.3)",
            }}
          >
            {data?.nowServing ?? "—"}
          </motion.p>
        </AnimatePresence>

        {data && data.upcoming.length > 0 && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <p className="text-sm font-medium tracking-widest text-white/40 uppercase">Up next</p>
            <div className="flex gap-3">
              {data.upcoming.map((t) => (
                <span
                  key={t}
                  className="rounded-xl bg-white/10 px-4 py-2 font-mono text-xl font-semibold text-white/80"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-end justify-between">
        <p className="text-sm text-white/40">
          {data ? `${data.waitingCount} waiting` : " "}
        </p>
        {joinUrl && (
          <div className="flex items-center gap-4 rounded-2xl bg-white p-3">
            <QRCode value={joinUrl} size={96} />
            <div className="pr-2 text-black">
              <p className="text-sm font-semibold">Scan to join</p>
              <p className="text-xs text-black/60">No signup needed</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
