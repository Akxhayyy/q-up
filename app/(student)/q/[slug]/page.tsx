import { JoinView } from "./join-view";

export default async function JoinPage({ params }: PageProps<"/q/[slug]">) {
  const { slug } = await params;
  return <JoinView slug={slug} />;
}
