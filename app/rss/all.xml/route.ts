import { prisma } from "@/lib/prisma";
import { buildRssFeed } from "@/lib/rss";

export async function GET() {
  const items = await prisma.feedItem.findMany({
    orderBy: { publishedAt: "desc" },
    take: 100,
  });

  const xml = buildRssFeed(
    {
      title: "Hermes - Tout",
      link: "https://hermes.somi.blaisot.org",
      description: "YouTube, animes et jeux suivis, dans un seul flux",
    },
    items
  );

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
