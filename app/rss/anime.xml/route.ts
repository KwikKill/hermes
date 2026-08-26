import { prisma } from "@/lib/prisma";
import { buildRssFeed } from "@/lib/rss";

export async function GET() {
  const items = await prisma.feedItem.findMany({
    where: { category: "ANIME" },
    orderBy: { publishedAt: "desc" },
    take: 100,
  });

  const xml = buildRssFeed(
    {
      title: "Hermes - Anime",
      link: "https://hermes.somi.blaisot.org",
      description: "Nouveaux épisodes des animes suivis",
    },
    items
  );

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
