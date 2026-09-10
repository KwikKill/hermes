import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { FeedItem, TrackedChannel, TrackedAnime, TrackedGame } from "@prisma/client";

const UPCOMING_LIMIT = 50;
const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 50;

type ItemWithSources = FeedItem & {
  trackedChannel: TrackedChannel | null;
  trackedAnime: TrackedAnime | null;
  trackedGame: TrackedGame | null;
};

function toPayload(item: ItemWithSources, now: Date) {
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
    seen: item.seen,
    vote: item.vote,
    isFuture: item.publishedAt > now,
    publishedAtDisplay: item.publishedAt.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

// Serves the /rss/widget page. Upcoming items (not yet aired/released) are
// returned in full - there are naturally few of them. "Recent" (already
// published) items are paginated server-side instead of shipping the whole
// backlog on every load.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE)
  );

  const now = new Date();
  const include = { trackedChannel: true, trackedAnime: true, trackedGame: true } as const;

  const [upcomingRows, recentTotal, recentRows] = await Promise.all([
    prisma.feedItem.findMany({
      where: { publishedAt: { gt: now } },
      orderBy: { publishedAt: "asc" },
      take: UPCOMING_LIMIT,
      include,
    }),
    prisma.feedItem.count({ where: { publishedAt: { lte: now } } }),
    prisma.feedItem.findMany({
      where: { publishedAt: { lte: now } },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include,
    }),
  ]);

  return NextResponse.json({
    upcoming: upcomingRows.map((item) => toPayload(item, now)),
    recent: recentRows.map((item) => toPayload(item, now)),
    recentTotal,
    page,
    pageSize,
  });
}
