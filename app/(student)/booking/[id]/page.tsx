import { BookingView } from "./booking-view";

export default async function BookingPage({ params }: PageProps<"/booking/[id]">) {
  const { id } = await params;
  return <BookingView id={id} />;
}
