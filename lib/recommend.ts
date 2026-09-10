import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RecoParams = {
  // Recency half-life (days): a historical item's weight is halved every
  // this-many days of age. Higher = long-past taste still counts.
  halfLifeDays: number;
  // Beta prior pseudo-counts. alpha = beta = 2 means "start every source at
  // 0.5, worth ~4 observations" - a source needs clearly more weighted
  // evidence than that before its own ratio dominates.
  priorAlpha: number;
  priorBeta: number;
  // Freshness window (days). Doubles as the "fair chance" cutoff: an unseen
  // item only counts as a settled negative once it's older than this, and
  // items younger than this are the pool that can be recommended.
  maxAgeDays: number;
};

export const DEFAULT_PARAMS: RecoParams = {
  halfLifeDays: 75,
  priorAlpha: 2,
  priorBeta: 2,
  maxAgeDays: 7,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Clamp everything to sane ranges - the tuning UI sends these straight from
// number inputs, and a 0 half-life or negative prior would break scoring.
export function sanitizeParams(raw: Partial<RecoParams> | null | undefined): RecoParams {
  const num = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return {
    halfLifeDays: clamp(num(raw?.halfLifeDays, DEFAULT_PARAMS.halfLifeDays), 1, 3650),
    priorAlpha: clamp(num(raw?.priorAlpha, DEFAULT_PARAMS.priorAlpha), 0.01, 1000),
    priorBeta: clamp(num(raw?.priorBeta, DEFAULT_PARAMS.priorBeta), 0.01, 1000),
    maxAgeDays: Math.round(clamp(num(raw?.maxAgeDays, DEFAULT_PARAMS.maxAgeDays), 1, 3650)),
  };
}

export async function getRecommendationSettings(): Promise<RecoParams> {
  const row = await prisma.recommendationSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {},
  });
  return sanitizeParams(row);
}

export async function saveRecommendationSettings(
  raw: Partial<RecoParams>
): Promise<RecoParams> {
  const params = sanitizeParams(raw);
  await prisma.recommendationSettings.upsert({
    where: { id: "singleton" },
    update: params,
    create: { id: "singleton", ...params },
  });
  return params;
}

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

export type ScoredItem = { item: RankedItem; score: number };

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

// Ranks unseen, recent (last maxAgeDays days) items by how much the user
// has historically engaged with that item's source. The per-source score is:
//
//     score = (Σ w·[seen]  +  α)  /  (Σ w  +  α + β)
//
// summed over "settled" history items only - an item is settled if it was
// seen (an immediate positive) or is older than maxAgeDays and still unseen
// (a settled negative). Fresher unseen items are pending and don't count.
// Each item's weight w = 0.5^(ageDays / halfLifeDays), so stale history
// fades toward the α/β prior instead of pinning a once-loved source at 1.0
// forever.
//
// Shared by the nightly Discord digest (app/api/digest/route.ts), the
// widget's "next media" card (app/rss/feed/next/route.ts) and the tuning
// page preview (app/api/recommend/preview/route.ts). Params come from the
// DB (RecommendationSettings) unless the caller passes an override, which
// only the tuning preview does.
export async function rankCandidatesScored(options: {
  limit: number;
  excludeNotified: boolean;
  params?: Partial<RecoParams>;
}): Promise<ScoredItem[]> {
  const { halfLifeDays, priorAlpha, priorBeta, maxAgeDays } = options.params
    ? sanitizeParams(options.params)
    : await getRecommendationSettings();

  const nowMs = Date.now();
  const now = new Date(nowMs);
  const oldestAllowed = new Date(nowMs - maxAgeDays * DAY_MS);

  const history = await prisma.feedItem.findMany({
    where: { publishedAt: { lte: now } },
    select: {
      seen: true,
      publishedAt: true,
      trackedChannelId: true,
      trackedAnimeId: true,
      trackedGameId: true,
    },
  });

  const stats = new Map<string, { wSeen: number; wTotal: number }>();
  for (const item of history) {
    const key = sourceKey(item);
    if (!key) continue;
    const ageDays = (nowMs - item.publishedAt.getTime()) / DAY_MS;
    const settled = item.seen || ageDays > maxAgeDays;
    if (!settled) continue;
    const weight = Math.pow(0.5, ageDays / halfLifeDays);
    const entry = stats.get(key) ?? { wSeen: 0, wTotal: 0 };
    entry.wTotal += weight;
    if (item.seen) entry.wSeen += weight;
    stats.set(key, entry);
  }

  const priorMean = priorAlpha / (priorAlpha + priorBeta);
  function interestScore(key: string | null): number {
    if (!key) return priorMean;
    const entry = stats.get(key);
    if (!entry) return priorMean;
    return (entry.wSeen + priorAlpha) / (entry.wTotal + priorAlpha + priorBeta);
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
    .slice(0, options.limit);
}

export async function rankCandidates(options: {
  limit: number;
  excludeNotified: boolean;
  params?: Partial<RecoParams>;
}): Promise<RankedItem[]> {
  return (await rankCandidatesScored(options)).map((scored) => scored.item);
}
