import { prisma } from "@/lib/prisma";
import { buildRssFeed } from "@/lib/rss";

export async function GET() {
  const items = await prisma.feedItem.findMany({
    where: { category: "YOUTUBE" },
    orderBy: { publishedAt: "desc" },
    take: 100,
  });

  const xml = buildRssFeed(
    {
      title: "Hermes - YouTube",
      link: "https://hermes.somi.blaisot.org",
      description: "Nouvelles vidéos des chaînes YouTube suivies",
    },
    items
  );

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
