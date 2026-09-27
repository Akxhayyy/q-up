import { BoardView } from "./board-view";

export default async function DisplayPage({ params }: PageProps<"/display/[slug]">) {
  const { slug } = await params;
  return <BoardView slug={slug} />;
}
