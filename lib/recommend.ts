import { prisma } from "@/lib/prisma";

// A source needs at least this many past (published) items before its
// seen-ratio is trusted - otherwise one early click either way would swing
// a brand new channel/anime/game to a 0% or 100% "interest" score.
const MIN_HISTORY_FOR_SCORE = 3;
const DEFAULT_SCORE = 0.5;
// Candidates older than this never get suggested, no matter how high their
// source's interest score is - otherwise a year-old backlog video from a
// well-liked channel could keep winning over what actually came out today.
const MAX_AGE_DAYS = 7;

export type Category = "YOUTUBE" | "ANIME" | "GAMES";

export type RankedItem = {
  id: string;
  category: Category;
  title: string;
  link: string;
  description: string | null;
  trackedChannelId: string | null;
  trackedAnimeId: string | null;
  trackedGameId: string | null;
  trackedChannel: { title: string; thumbnail: string | null } | null;
  trackedAnime: { title: string; coverImage: string | null } | null;
  trackedGame: { name: string; image: string | null } | null;
};

function sourceKey(item: {
  trackedChannelId: string | null;
  trackedAnimeId: string | null;
  trackedGameId: string | null;
}): string | null {
  return item.trackedChannelId ?? item.trackedAnimeId ?? item.trackedGameId;
}

export function sourceLabel(item: RankedItem): string {
  return (
    item.trackedChannel?.title ?? item.trackedAnime?.title ?? item.trackedGame?.name ?? "?"
  );
}

export function sourceImage(item: RankedItem): string | null {
  return (
    item.trackedChannel?.thumbnail ?? item.trackedAnime?.coverImage ?? item.trackedGame?.image ?? null
  );
}

// Ranks unseen, already-published (last MAX_AGE_DAYS days only), items by
// how much the user has historically engaged with that item's source
// (channel/anime/game) - approximated as the fraction of that source's past
// items marked "seen". Shared by the nightly Discord digest
// (app/api/digest/route.ts) and the "next media" card on /rss/widget
// (app/rss/feed/next/route.ts) - same ranking, two different consumers.
export async function rankCandidates(options: {
  limit: number;
  // The digest excludes items it already suggested before (see
  // FeedItem.notifiedAt); the "next media" card doesn't - it should always
  // be able to show the current best recommendation regardless of whether
  // it was already pushed to Discord.
  excludeNotified: boolean;
}): Promise<RankedItem[]> {
  const now = new Date();
  const oldestAllowed = new Date(now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  const history = await prisma.feedItem.findMany({
    where: { publishedAt: { lte: now } },
    select: {
      seen: true,
      trackedChannelId: true,
      trackedAnimeId: true,
      trackedGameId: true,
    },
  });

  const stats = new Map<string, { seen: number; total: number }>();
  for (const item of history) {
    const key = sourceKey(item);
    if (!key) continue;
    const entry = stats.get(key) ?? { seen: 0, total: 0 };
    entry.total += 1;
    if (item.seen) entry.seen += 1;
    stats.set(key, entry);
  }

  function interestScore(key: string | null): number {
    if (!key) return DEFAULT_SCORE;
    const entry = stats.get(key);
    if (!entry || entry.total < MIN_HISTORY_FOR_SCORE) return DEFAULT_SCORE;
    return entry.seen / entry.total;
  }

  const candidates: RankedItem[] = await prisma.feedItem.findMany({
    where: {
      seen: false,
      publishedAt: { lte: now, gte: oldestAllowed },
      ...(options.excludeNotified ? { notifiedAt: null } : {}),
    },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      category: true,
      title: true,
      link: true,
      description: true,
      trackedChannelId: true,
      trackedAnimeId: true,
      trackedGameId: true,
      trackedChannel: { select: { title: true, thumbnail: true } },
      trackedAnime: { select: { title: true, coverImage: true } },
      trackedGame: { select: { name: true, image: true } },
    },
  });

  return candidates
    .map((item) => ({ item, score: interestScore(sourceKey(item)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit)
    .map(({ item }) => item);
}
