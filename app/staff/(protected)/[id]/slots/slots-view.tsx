"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthCalendar } from "@/components/month-calendar";
import { apiGet, apiSend, ApiError } from "@/lib/api-client";
import { bulkSlotSchema } from "@/lib/validators";

type Slot = { id: string; startsAt: string; endsAt: string; capacity: number; bookedCount: number };
type Booking = {
  id: string;
  holderName: string;
  studentId: string;
  status: "BOOKED" | "CANCELLED" | "CONVERTED" | "NO_SHOW";
  startsAt: string;
  endsAt: string;
  updatedAt: string;
};

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const STATUS_BADGE: Record<Booking["status"], "default" | "secondary" | "outline"> = {
  BOOKED: "default",
  CONVERTED: "outline",
  CANCELLED: "secondary",
  NO_SHOW: "secondary",
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

/** Today and +7 days, so the bulk-generate form is submittable without the
 * user having to realize the native date inputs start out empty — leaving
 * them blank silently blocks submission behind small validation text that's
 * easy to miss next to the already-preselected days-of-week buttons. */
function defaultDateRange(): { startDate: string; endDate: string } {
  const start = new Date();
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + 7);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export function SlotsView({ serviceId }: { serviceId: string }) {
  const [month, setMonth] = useState(currentMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    ...defaultDateRange(),
    daysOfWeek: [1, 2, 3, 4, 5] as number[],
    dailyStartTime: "09:00",
    dailyEndTime: "17:00",
    slotMinutes: 30,
    capacity: 5,
  });
  const [bulkErrors, setBulkErrors] = useState<Record<string, string[]>>({});
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const [year, m] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, m - 1, 1)).toISOString();
  const monthEnd = new Date(Date.UTC(year, m, 1)).toISOString();

  const { data: slots, isLoading: loadingSlots, mutate: mutateSlots } = useSWR<Slot[]>(
    `/api/staff/services/${serviceId}/slots?from=${monthStart}&to=${monthEnd}`,
    apiGet
  );

  const { data: bookings, mutate: mutateBookings } = useSWR<Booking[]>(
    selectedDate ? `/api/staff/services/${serviceId}/bookings?date=${selectedDate}` : null,
    apiGet,
    { refreshInterval: 5000 }
  );

  const dayInfo: Record<string, { available: boolean; count: number }> = {};
  for (const s of slots ?? []) {
    const key = s.startsAt.slice(0, 10);
    const entry = dayInfo[key] ?? { available: true, count: 0 };
    entry.count += 1;
    dayInfo[key] = entry;
  }

  const daySlots = (slots ?? []).filter((s) => s.startsAt.slice(0, 10) === selectedDate);

  function toggleDay(value: number) {
    setBulkForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(value)
        ? f.daysOfWeek.filter((d) => d !== value)
        : [...f.daysOfWeek, value].sort(),
    }));
  }

  async function handleBulkGenerate() {
    const parsed = bulkSlotSchema.safeParse(bulkForm);
    if (!parsed.success) {
      setBulkErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    setBulkErrors({});
    setBulkSubmitting(true);
    try {
      const res = await apiSend<{ created: number; attempted: number }>(
        `/api/staff/services/${serviceId}/slots/bulk`,
        "POST",
        parsed.data
      );
      toast.success(`Created ${res.created} slots`);
      mutateSlots();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBulkSubmitting(false);
    }
  }

  async function deleteSlot(id: string) {
    try {
      await apiSend(`/api/staff/slots/${id}`, "DELETE");
      toast.success("Slot removed");
      mutateSlots();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function bookingAction(id: string, action: "CHECK_IN" | "NO_SHOW" | "CANCEL") {
    setActioningId(id);
    try {
      await apiSend(`/api/staff/bookings/${id}`, "PATCH", { action });
      mutateBookings();
      mutateSlots();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setActioningId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-5 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Manage bookings</h1>
        <Button size="sm" variant="outline" onClick={() => setShowBulkForm((v) => !v)}>
          {showBulkForm ? "Close" : "Generate slots"}
        </Button>
      </div>

      {showBulkForm && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Start date</Label>
              <Input
                type="date"
                value={bulkForm.startDate}
                onChange={(e) => setBulkForm({ ...bulkForm, startDate: e.target.value })}
              />
              {bulkErrors.startDate?.map((m) => (
                <p key={m} className="text-xs text-destructive">
                  {m}
                </p>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>End date</Label>
              <Input
                type="date"
                value={bulkForm.endDate}
                onChange={(e) => setBulkForm({ ...bulkForm, endDate: e.target.value })}
              />
              {bulkErrors.endDate?.map((m) => (
                <p key={m} className="text-xs text-destructive">
                  {m}
                </p>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Daily start</Label>
              <Input
                type="time"
                value={bulkForm.dailyStartTime}
                onChange={(e) => setBulkForm({ ...bulkForm, dailyStartTime: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Daily end</Label>
              <Input
                type="time"
                value={bulkForm.dailyEndTime}
                onChange={(e) => setBulkForm({ ...bulkForm, dailyEndTime: e.target.value })}
              />
              {bulkErrors.dailyEndTime?.map((m) => (
                <p key={m} className="text-xs text-destructive">
                  {m}
                </p>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Slot length (min)</Label>
              <Input
                type="number"
                value={bulkForm.slotMinutes}
                onChange={(e) => setBulkForm({ ...bulkForm, slotMinutes: Number(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Capacity per slot</Label>
              <Input
                type="number"
                value={bulkForm.capacity}
                onChange={(e) => setBulkForm({ ...bulkForm, capacity: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Days of week</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((w) => (
                <Button
                  key={w.value}
                  type="button"
                  size="sm"
                  variant={bulkForm.daysOfWeek.includes(w.value) ? "default" : "outline"}
                  onClick={() => toggleDay(w.value)}
                >
                  {w.label}
                </Button>
              ))}
            </div>
            {bulkErrors.daysOfWeek?.map((m) => (
              <p key={m} className="text-xs text-destructive">
                {m}
              </p>
            ))}
          </div>
          <Button disabled={bulkSubmitting} onClick={handleBulkGenerate} className="w-fit">
            {bulkSubmitting ? "Generating…" : "Generate slots"}
          </Button>
        </div>
      )}

      {loadingSlots ? (
        <Skeleton className="h-80 w-full rounded-2xl" />
      ) : (
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          dayInfo={dayInfo}
          disablePast={false}
        />
      )}

      {selectedDate && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="mb-3 text-sm font-semibold">Slots on {selectedDate}</p>
            {daySlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No slots this day.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {daySlots.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      {formatTime(s.startsAt)}–{formatTime(s.endsAt)}
                    </span>
                    <span className="text-muted-foreground">
                      {s.bookedCount}/{s.capacity} booked
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={s.bookedCount > 0}
                      onClick={() => deleteSlot(s.id)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="mb-3 text-sm font-semibold">Bookings on {selectedDate}</p>
            {!bookings || bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings this day.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {bookings.map((b) => (
                  <li key={b.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">
                        {formatTime(b.startsAt)} · {b.holderName}
                      </p>
                      <p className="text-xs text-muted-foreground">{b.studentId}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_BADGE[b.status]}>{b.status}</Badge>
                      {b.status === "BOOKED" && (
                        <>
                          <Button
                            size="sm"
                            disabled={actioningId === b.id}
                            onClick={() => bookingAction(b.id, "CHECK_IN")}
                          >
                            Check in
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actioningId === b.id}
                            onClick={() => bookingAction(b.id, "NO_SHOW")}
                          >
                            No-show
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={actioningId === b.id}
                            onClick={() => bookingAction(b.id, "CANCEL")}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
