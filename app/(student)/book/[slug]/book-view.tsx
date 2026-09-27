"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthCalendar } from "@/components/month-calendar";
import { apiGet, apiSend, ApiError } from "@/lib/api-client";
import { joinTicketSchema } from "@/lib/validators";
import { springs, motionTokens } from "@/lib/motion-tokens";

type Slot = { id: string; startsAt: string; endsAt: string; capacity: number; bookedCount: number; available: number };

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

export function BookView({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rescheduleId = searchParams.get("reschedule");

  const [month, setMonth] = useState(currentMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [holderName, setHolderName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: availability, isLoading: loadingAvailability } = useSWR<{
    days: { date: string; availableSeats: number; totalCapacity: number }[];
  }>(`/api/services/${slug}/availability?month=${month}`, apiGet);

  const { data: slots, isLoading: loadingSlots } = useSWR<Slot[]>(
    selectedDate ? `/api/services/${slug}/slots?date=${selectedDate}` : null,
    apiGet
  );

  const dayInfo: Record<string, { available: boolean; count: number }> = {};
  for (const d of availability?.days ?? []) {
    dayInfo[d.date] = { available: d.availableSeats > 0, count: d.availableSeats };
  }

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;
    setFormError(null);

    if (rescheduleId) {
      setSubmitting(true);
      try {
        await apiSend(`/api/bookings/${rescheduleId}/reschedule`, "POST", { newSlotId: selectedSlot.id });
        router.push(`/booking/${rescheduleId}`);
      } catch (err) {
        setFormError(err instanceof ApiError ? err.message : "Something went wrong");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const parsed = joinTicketSchema.safeParse({ holderName, studentId });
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const booking = await apiSend<{ id: string }>(`/api/slots/${selectedSlot.id}/bookings`, "POST", parsed.data);
      router.push(`/booking/${booking.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-5 py-8 sm:px-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {rescheduleId ? "Pick a new time" : "Book a future slot"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {rescheduleId
            ? "Choose a new date and time for your booking."
            : "Too busy right now? Reserve a spot for another day."}
        </p>
      </div>

      {loadingAvailability ? (
        <Skeleton className="h-80 w-full rounded-2xl" />
      ) : (
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setSelectedSlot(null);
          }}
          dayInfo={dayInfo}
        />
      )}

      {selectedDate && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Available times on {selectedDate}</p>
          {loadingSlots ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : slots && slots.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  variant={selectedSlot?.id === s.id ? "default" : "outline"}
                  disabled={s.available === 0}
                  onClick={() => setSelectedSlot(s)}
                  size="sm"
                >
                  {formatTime(s.startsAt)}
                  {s.available > 0 ? ` · ${s.available} left` : " · full"}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No times available this day.</p>
          )}
        </div>
      )}

      {selectedSlot && (
        <motion.form
          initial={{ opacity: 0, y: motionTokens.distance.sm }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.gentle}
          onSubmit={handleBook}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
        >
          <p className="text-sm">
            Booking <strong>{formatTime(selectedSlot.startsAt)}</strong> on {selectedDate}
          </p>

          {!rescheduleId && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="holderName">Your name</Label>
                <Input
                  id="holderName"
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  disabled={submitting}
                />
                {fieldErrors.holderName?.map((m) => (
                  <p key={m} className="text-xs text-destructive">
                    {m}
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
                  disabled={submitting}
                />
                {fieldErrors.studentId?.map((m) => (
                  <p key={m} className="text-xs text-destructive">
                    {m}
                  </p>
                ))}
              </div>
            </>
          )}

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Booking…" : rescheduleId ? "Confirm new time" : "Book this slot"}
          </Button>
        </motion.form>
      )}
    </div>
  );
}
