import { SlotsView } from "./slots-view";

export default async function StaffSlotsPage({ params }: PageProps<"/staff/[id]/slots">) {
  const { id } = await params;
  return <SlotsView serviceId={id} />;
}
