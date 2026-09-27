"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { apiSend } from "@/lib/api-client";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useSession(["ADMIN"]);

  async function handleLogout() {
    await apiSend("/api/auth/logout", "POST");
    router.push("/staff/login");
  }

  if (isLoading || !user) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-5 py-3 sm:px-8">
        <Link href="/admin" className="text-lg font-bold tracking-tight">
          <span className="text-orange-500">Q</span>-Up{" "}
          <span className="text-sm font-normal text-muted-foreground">admin</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <ThemeToggle />
          <Link href="/staff" className="text-muted-foreground underline-offset-4 hover:underline">
            Staff console
          </Link>
          <span className="text-muted-foreground">{user.name}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
