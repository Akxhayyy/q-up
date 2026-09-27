import { BookView } from "./book-view";

export default async function BookPage({ params }: PageProps<"/book/[slug]">) {
  const { slug } = await params;
  return <BookView slug={slug} />;
}
