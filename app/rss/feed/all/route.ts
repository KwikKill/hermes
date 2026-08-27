import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const items = await prisma.feedItem.findMany({
    orderBy: { publishedAt: "desc" },
    take: 100,
    include: {
      trackedChannel: true,
      trackedAnime: true,
      trackedGame: true,
    },
  });

  const now = new Date();

  const payload = items.map((item) => {
    const source =
      item.trackedChannel?.title ?? item.trackedAnime?.title ?? item.trackedGame?.name ?? null;
    const image =
      item.trackedChannel?.thumbnail ?? item.trackedAnime?.coverImage ?? item.trackedGame?.image ?? null;

    return {
      id: item.id,
      category: item.category,
      title: item.title,
      link: item.link,
      description: item.description,
      source,
      image,
      isFuture: item.publishedAt > now,
      publishedAtDisplay: item.publishedAt.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  });

  return NextResponse.json({ items: payload });
}
