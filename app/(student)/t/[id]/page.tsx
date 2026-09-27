import { TicketView } from "./ticket-view";

export default async function TicketPage({ params }: PageProps<"/t/[id]">) {
  const { id } = await params;
  return <TicketView id={id} />;
}
