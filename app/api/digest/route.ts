import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_MAX_ITEMS = 8;
// A source needs at least this many past (published) items before its
// seen-ratio is trusted - otherwise one early click either way would swing
// a brand new channel/anime/game to a 0% or 100% "interest" score.
const MIN_HISTORY_FOR_SCORE = 3;
const DEFAULT_SCORE = 0.5;
// Candidates older than this never get suggested, no matter how high their
// source's interest score is - otherwise a year-old backlog video from a
// well-liked channel could keep winning over what actually came out today.
const MAX_AGE_DAYS = 7;

type Category = "YOUTUBE" | "ANIME" | "GAMES";

type CandidateItem = {
  id: string;
  category: Category;
  title: string;
  link: string;
  trackedChannelId: string | null;
  trackedAnimeId: string | null;
  trackedGameId: string | null;
  trackedChannel: { title: string } | null;
  trackedAnime: { title: string } | null;
  trackedGame: { name: string } | null;
};

function sourceKey(item: {
  trackedChannelId: string | null;
  trackedAnimeId: string | null;
  trackedGameId: string | null;
}): string | null {
  return item.trackedChannelId ?? item.trackedAnimeId ?? item.trackedGameId;
}

function sourceLabel(item: CandidateItem): string {
  return (
    item.trackedChannel?.title ?? item.trackedAnime?.title ?? item.trackedGame?.name ?? "?"
  );
}

// Ranks unseen, already-published, not-yet-notified items by how much the
// user has historically engaged with that item's source (channel/anime/
// game) - approximated as the fraction of that source's past items marked
// "seen". Picked over a flat "everything new" digest because the whole
// point is not to notify for everything (see route docstring below).
async function pickDigestItems(maxItems: number): Promise<CandidateItem[]> {
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

  const candidates: CandidateItem[] = await prisma.feedItem.findMany({
    where: {
      seen: false,
      notifiedAt: null,
      publishedAt: { lte: now, gte: oldestAllowed },
    },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      category: true,
      title: true,
      link: true,
      trackedChannelId: true,
      trackedAnimeId: true,
      trackedGameId: true,
      trackedChannel: { select: { title: true } },
      trackedAnime: { select: { title: true } },
      trackedGame: { select: { name: true } },
    },
  });

  return candidates
    .map((item) => ({ item, score: interestScore(sourceKey(item)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map(({ item }) => item);
}

const CATEGORY_EMOJI: Record<Category, string> = {
  YOUTUBE: "\u{1F4FA}",
  ANIME: "\u{1F3AC}",
  GAMES: "\u{1F3AE}",
};

async function sendDiscordDigest(webhookUrl: string, items: CandidateItem[]): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Hermes",
      embeds: [
        {
          title: "Ce soir, tu pourrais aimer...",
          color: 0x2f6f5e,
          fields: items.map((item) => ({
            name: `${CATEGORY_EMOJI[item.category]} ${sourceLabel(item)}`.slice(0, 256),
            value: `[${item.title}](${item.link})`.slice(0, 1024),
          })),
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Discord webhook failed: ${res.status} ${await res.text()}`);
  }
}

// Called by the hermes-cron sidecar every evening (see
// hermes/cron/digest.sh + crontab) - a curated nightly nudge, not a
// notification for every new item (there'd be far too many to actually look
// at). Picks the items the user is statistically most likely to care about
// (see pickDigestItems) and posts them to a Discord webhook. Each notified
// item is marked so it's never suggested again, whether or not it then gets
// marked "seen".
export async function POST(request: NextRequest) {
  const secret = process.env.HERMES_POLL_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.HERMES_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ sent: 0, reason: "no-webhook-configured" });
  }

  const maxItems = Number(process.env.HERMES_DIGEST_MAX_ITEMS) || DEFAULT_MAX_ITEMS;
  const items = await pickDigestItems(maxItems);

  if (items.length === 0) {
    return NextResponse.json({ sent: 0, reason: "no-candidates" });
  }

  await sendDiscordDigest(webhookUrl, items);

  await prisma.feedItem.updateMany({
    where: { id: { in: items.map((item) => item.id) } },
    data: { notifiedAt: new Date() },
  });

  return NextResponse.json({ sent: items.length });
}
