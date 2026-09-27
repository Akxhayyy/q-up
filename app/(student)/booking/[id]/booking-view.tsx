"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, ApiError } from "@/lib/api-client";

type BookingStatus = "BOOKED" | "CANCELLED" | "CONVERTED" | "NO_SHOW";

type BookingData = {
  id: string;
  status: BookingStatus;
  holderName: string;
  slot: { startsAt: string; endsAt: string };
  service: { slug: string; name: string };
  convertedTicketId: string | null;
};

const STATUS_COPY: Record<BookingStatus, string> = {
  BOOKED: "Booking confirmed",
  CANCELLED: "Booking cancelled",
  CONVERTED: "You've been checked in",
  NO_SHOW: "Marked as no-show",
};

function formatSlot(startsAt: string): string {
  const d = new Date(startsAt);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function BookingView({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useSWR<BookingData>(`/api/bookings/${id}`, apiGet, {
    refreshInterval: 5000,
  });
  const [cancelling, setCancelling] = useState(false);
  const prevStatus = useRef<BookingStatus | null>(null);

  useEffect(() => {
    if (!data) return;
    if (prevStatus.current && prevStatus.current !== data.status) {
      toast.success(STATUS_COPY[data.status]);
    }
    prevStatus.current = data.status;
  }, [data?.status]);

  async function handleCancel() {
    setCancelling(true);
    try {
      await apiSend(`/api/bookings/${id}`, "DELETE");
      toast.success("Booking cancelled");
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setCancelling(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-72" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-lg font-semibold">
          {error instanceof ApiError ? error.message : "Couldn't load this booking"}
        </p>
        <Button variant="outline" nativeButton={false} render={<Link href="/">Back to services</Link>} />
      </div>
    );
  }

  const isBooked = data.status === "BOOKED";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <p className="text-sm font-medium text-muted-foreground">{data.service.name}</p>
      <div className="rounded-3xl border border-border bg-card px-8 py-6">
        <p className="text-3xl font-bold tracking-tight">{formatSlot(data.slot.startsAt)}</p>
        <p className="text-sm text-muted-foreground">{data.holderName}</p>
      </div>

      <p className="text-lg font-semibold">{STATUS_COPY[data.status]}</p>

      {data.status === "CONVERTED" && data.convertedTicketId && (
        <Button nativeButton={false} render={<Link href={`/t/${data.convertedTicketId}`}>View your live ticket</Link>} />
      )}

      {isBooked && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/book/${data.service.slug}?reschedule=${id}`}>Reschedule</Link>}
          />
          <Button variant="ghost" disabled={cancelling} onClick={handleCancel}>
            {cancelling ? "Cancelling…" : "Cancel booking"}
          </Button>
        </div>
      )}
      {!isBooked && (
        <p className="text-xs text-muted-foreground">This booking is no longer active.</p>
      )}
    </div>
  );
}
