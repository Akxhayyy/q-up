import { ServiceList } from "./service-list";

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-10 sm:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Skip the line.
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, var(--gradient-from), var(--gradient-via), var(--gradient-to))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Join from your phone.
          </span>
        </h1>
        <p className="text-muted-foreground">
          Pick a service, get a token, and watch your position update live. No account needed.
        </p>
      </div>
      <ServiceList />
    </div>
  );
}
