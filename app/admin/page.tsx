"use client";

import useSWR from "swr";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, ApiError } from "@/lib/api-client";
import { ServicesManager } from "./services-manager";

type Stats = {
  today: { issued: number; served: number; cancelled: number; noShow: number; waiting: number };
  hourly: { hour: number; count: number }[];
  perService: {
    slug: string;
    name: string;
    code: string;
    waitingNow: number;
    issuedTotal: number;
    servedTotal: number;
    cancelledTotal: number;
    noShowTotal: number;
    avgWaitSecs: number | null;
    avgServiceSecs: number | null;
  }[];
};

function minutes(secs: number | null): number {
  return secs ? Math.round((secs / 60) * 10) / 10 : 0;
}

const KPI_TILES: { key: keyof Stats["today"]; label: string; tone: string }[] = [
  { key: "waiting", label: "Waiting now", tone: "text-primary" },
  { key: "issued", label: "Issued today", tone: "text-foreground" },
  { key: "served", label: "Served today", tone: "text-success" },
  { key: "cancelled", label: "Cancelled today", tone: "text-muted-foreground" },
  { key: "noShow", label: "No-shows today", tone: "text-destructive" },
];

export default function AdminPage() {
  const { data, error, isLoading } = useSWR<Stats>("/api/staff/stats", apiGet, {
    refreshInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
        {error instanceof ApiError ? error.message : "Couldn't load stats."}
      </div>
    );
  }

  const hourlyData = data.hourly
    .filter((h) => h.count > 0 || (h.hour >= 8 && h.hour <= 18))
    .map((h) => ({ hour: `${h.hour}:00`, tokens: h.count }));

  const comparisonData = data.perService.map((s) => ({
    name: s.code,
    "Avg wait (min)": minutes(s.avgWaitSecs),
    "Avg service (min)": minutes(s.avgServiceSecs),
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-5 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">Queue statistics</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {KPI_TILES.map((tile) => (
          <div key={tile.key} className="rounded-xl border border-border bg-card p-4">
            <p className={`text-2xl font-bold ${tile.tone}`}>{data.today[tile.key]}</p>
            <p className="text-xs text-muted-foreground">{tile.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-1 font-semibold">Tokens issued per hour</h2>
        <p className="mb-4 text-xs text-muted-foreground">Last 6 days, including today</p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={200} debounce={1}>
            <BarChart data={hourlyData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="tokens" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-1 font-semibold">Avg wait vs. avg service time</h2>
        <p className="mb-4 text-xs text-muted-foreground">Minutes, last 6 days</p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={200} debounce={1}>
            <BarChart data={comparisonData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Avg wait (min)" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar
                dataKey="Avg service (min)"
                fill="var(--chart-2)"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold">Per-service breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Service</th>
                <th className="pb-2 font-medium">Waiting</th>
                <th className="pb-2 font-medium">Issued</th>
                <th className="pb-2 font-medium">Served</th>
                <th className="pb-2 font-medium">Cancelled</th>
                <th className="pb-2 font-medium">No-show</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.perService.map((s) => (
                <tr key={s.slug}>
                  <td className="py-2 font-medium">{s.name}</td>
                  <td className="py-2">
                    <Badge variant="outline">{s.waitingNow}</Badge>
                  </td>
                  <td className="py-2">{s.issuedTotal}</td>
                  <td className="py-2 text-success">{s.servedTotal}</td>
                  <td className="py-2 text-muted-foreground">{s.cancelledTotal}</td>
                  <td className="py-2 text-destructive">{s.noShowTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ServicesManager />
    </div>
  );
}
