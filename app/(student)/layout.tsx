import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-student flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="text-lg font-bold tracking-tight">
          <span className="text-orange-500">Q</span>-Up
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/staff/login"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Staff login
          </Link>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
