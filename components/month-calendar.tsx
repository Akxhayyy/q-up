"use client";

import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motionTokens } from "@/lib/motion-tokens";

export type DayInfo = { available?: boolean; count?: number };

function toDateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthCalendar({
  month, // "YYYY-MM"
  onMonthChange,
  selectedDate,
  onSelectDate,
  dayInfo,
  disablePast = true,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  dayInfo: Record<string, DayInfo>;
  disablePast?: boolean;
}) {
  const [year, m] = month.split("-").map(Number);
  const monthIndex = m - 1;
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const todayKey = new Date().toISOString().slice(0, 10);

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, monthIndex + delta, 1));
    onMonthChange(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </Button>
        <p className="text-sm font-semibold">
          {new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </p>
        <Button variant="ghost" size="icon-sm" onClick={() => shiftMonth(1)} aria-label="Next month">
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const key = toDateKey(year, monthIndex, day);
          const info = dayInfo[key];
          const isPast = disablePast && key < todayKey;
          const isSelectable = !isPast && (info?.available ?? false);
          const isSelected = selectedDate === key;

          return (
            <motion.button
              key={key}
              type="button"
              disabled={!isSelectable}
              onClick={() => isSelectable && onSelectDate(key)}
              whileTap={isSelectable ? { scale: motionTokens.scale.press } : undefined}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground font-semibold"
                  : isSelectable
                    ? "bg-muted hover:bg-accent hover:text-accent-foreground cursor-pointer"
                    : "text-muted-foreground/40 cursor-not-allowed"
              }`}
            >
              <span>{day}</span>
              {info?.available && !isSelected && (
                <span className="text-[10px] text-success">
                  {info.count !== undefined ? info.count : "•"}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
