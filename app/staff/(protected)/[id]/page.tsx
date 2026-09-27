import { ConsoleView } from "./console-view";

export default async function StaffConsolePage({ params }: PageProps<"/staff/[id]">) {
  const { id } = await params;
  return <ConsoleView serviceId={id} />;
}
