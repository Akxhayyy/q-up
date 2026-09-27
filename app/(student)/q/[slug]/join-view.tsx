"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, ApiError } from "@/lib/api-client";
import { joinTicketSchema } from "@/lib/validators";
import { springs, motionTokens } from "@/lib/motion-tokens";

type Service = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  location: string | null;
  status: "OPEN" | "PAUSED" | "CLOSED";
  waitingCount: number;
  etaSeconds: number;
};

function formatEta(seconds: number): string {
  if (seconds < 60) return "under a minute";
  return `~${Math.round(seconds / 60)} min`;
}

export function JoinView({ slug }: { slug: string }) {
  const router = useRouter();
  const { data: service, error, isLoading } = useSWR<Service>(`/api/services/${slug}`, apiGet, {
    refreshInterval: 5000,
  });
  const [holderName, setHolderName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parsed = joinTicketSchema.safeParse({ holderName, studentId });
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      const ticket = await apiSend<{ id: string }>(`/api/services/${slug}/tickets`, "POST", parsed.data);
      router.push(`/t/${ticket.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-10 sm:px-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
        <p className="text-lg font-semibold">
          {error instanceof ApiError ? error.message : "Service not found"}
        </p>
        <Button variant="outline" nativeButton={false} render={<Link href="/">Back to services</Link>} />
      </div>
    );
  }

  const joinable = service.status === "OPEN";

  return (
    <motion.div
      initial={{ opacity: 0, y: motionTokens.distance.md }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-10 sm:px-8"
    >
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{service.name}</h1>
          <Badge variant={joinable ? "default" : "secondary"}>
            {service.status === "OPEN" ? "Open" : service.status === "PAUSED" ? "Paused" : "Closed"}
          </Badge>
        </div>
        {service.location && <p className="text-sm text-muted-foreground">{service.location}</p>}
        {service.description && <p className="mt-2 text-sm">{service.description}</p>}
        <p className="mt-3 text-sm text-muted-foreground">
          {service.waitingCount} waiting · {formatEta(service.etaSeconds)} estimated wait
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="holderName">Your name</Label>
          <Input
            id="holderName"
            value={holderName}
            onChange={(e) => setHolderName(e.target.value)}
            placeholder="e.g. Priya Sharma"
            disabled={!joinable || submitting}
            aria-invalid={!!fieldErrors.holderName}
          />
          {fieldErrors.holderName?.map((msg) => (
            <p key={msg} className="text-xs text-destructive">
              {msg}
            </p>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="studentId">Student ID</Label>
          <Input
            id="studentId"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="RAXXXXXXXXXXXXX"
            disabled={!joinable || submitting}
            aria-invalid={!!fieldErrors.studentId}
          />
          {fieldErrors.studentId?.map((msg) => (
            <p key={msg} className="text-xs text-destructive">
              {msg}
            </p>
          ))}
        </div>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <Button type="submit" disabled={!joinable || submitting} className="mt-1">
          {submitting ? "Joining…" : "Join queue"}
        </Button>
        {!joinable && (
          <p className="text-center text-xs text-muted-foreground">
            {service.status === "PAUSED"
              ? "This queue is paused — you can't join right now."
              : "This queue is closed for today."}
          </p>
        )}
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Too busy right now?{" "}
        <Link href={`/book/${slug}`} className="font-medium text-foreground underline-offset-4 hover:underline">
          Book a slot for another day
        </Link>
      </p>
    </motion.div>
  );
}
