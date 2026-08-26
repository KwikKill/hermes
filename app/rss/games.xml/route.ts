import { prisma } from "@/lib/prisma";
import { buildRssFeed } from "@/lib/rss";

export async function GET() {
  const items = await prisma.feedItem.findMany({
    where: { category: "GAMES" },
    orderBy: { publishedAt: "desc" },
    take: 100,
  });

  const xml = buildRssFeed(
    {
      title: "Hermes - Jeux",
      link: "https://hermes.somi.blaisot.org",
      description: "Sorties des jeux vidéo suivis",
    },
    items
  );

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
