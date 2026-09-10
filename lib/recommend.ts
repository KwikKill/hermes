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
  // A vote counts as this many normal watched / ignored items when scoring
  // the whole source.
  upvoteWeight: number;
  downvoteWeight: number;
  // Pseudo-observations pulling a (source, duration-bucket) score back
  // toward the source's overall score when the bucket is thin on data.
  durationBackoffCount: number;
  // Max items from one source a single digest may contain.
  digestMaxPerSource: number;
};

export const DEFAULT_PARAMS: RecoParams = {
  halfLifeDays: 75,
  priorAlpha: 2,
  priorBeta: 2,
  maxAgeDays: 7,
  upvoteWeight: 2,
  downvoteWeight: 2,
  durationBackoffCount: 3,
  digestMaxPerSource: 3,
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
    upvoteWeight: clamp(num(raw?.upvoteWeight, DEFAULT_PARAMS.upvoteWeight), 1, 100),
    downvoteWeight: clamp(num(raw?.downvoteWeight, DEFAULT_PARAMS.downvoteWeight), 1, 100),
    durationBackoffCount: clamp(
      num(raw?.durationBackoffCount, DEFAULT_PARAMS.durationBackoffCount),
      0,
      1000
    ),
    digestMaxPerSource: Math.round(
      clamp(num(raw?.digestMaxPerSource, DEFAULT_PARAMS.digestMaxPerSource), 1, 1000)
    ),
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
  vote: number;
  durationSeconds: number | null;
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

type DurationBucket = "S" | "M" | "L" | "XL";

// < 5 min / 5-20 min / 20-60 min / > 60 min. Fixed boundaries on purpose -
// the tunable part is durationBackoffCount, not where the lines sit.
function durationBucket(seconds: number): DurationBucket {
  if (seconds < 300) return "S";
  if (seconds < 1200) return "M";
  if (seconds < 3600) return "L";
  return "XL";
}

type Agg = { wSeen: number; wTotal: number };
type SourceStats = { overall: Agg; buckets: Map<DurationBucket, Agg> };

function emptyAgg(): Agg {
  return { wSeen: 0, wTotal: 0 };
}

// Scores unseen, recent (last maxAgeDays days) items by how much the user
// has historically engaged with that item's source.
//
// Base per-source score is a recency-weighted Beta estimate over "settled"
// history items - settled = seen, voted, or older than maxAgeDays. Each
// item's weight is 0.5^(ageDays / halfLifeDays), multiplied by upvote/
// downvote weight when it carries a vote:
//
//     score(source) = (Σ w·[positive] + α) / (Σ w + α + β)
//
// where positive = upvoted, or (seen and not downvoted).
//
// For YouTube items that have a stored duration, the score is refined by a
// per-(source, duration-bucket) estimate that backs off to the source's
// overall score with durationBackoffCount pseudo-observations - so a
// channel whose 1h+ videos you skip scores those low even if its short
// videos keep its overall score high.
//
// Shared by the nightly digest (app/api/digest), the widget's "next media"
// card (app/rss/feed/next) and the tuning preview (app/api/recommend/
// preview). Params come from the DB unless the caller passes an override
// (only the tuning preview does). `diversify` applies digestMaxPerSource as
// a per-source cap on the final selection (the digest sets it).
export async function rankCandidatesScored(options: {
  limit: number;
  excludeNotified: boolean;
  diversify?: boolean;
  params?: Partial<RecoParams>;
}): Promise<ScoredItem[]> {
  const {
    halfLifeDays,
    priorAlpha,
    priorBeta,
    maxAgeDays,
    upvoteWeight,
    downvoteWeight,
    durationBackoffCount,
    digestMaxPerSource,
  } = options.params ? sanitizeParams(options.params) : await getRecommendationSettings();

  const nowMs = Date.now();
  const now = new Date(nowMs);
  const oldestAllowed = new Date(nowMs - maxAgeDays * DAY_MS);

  const history = await prisma.feedItem.findMany({
    where: { publishedAt: { lte: now } },
    select: {
      seen: true,
      vote: true,
      durationSeconds: true,
      publishedAt: true,
      trackedChannelId: true,
      trackedAnimeId: true,
      trackedGameId: true,
    },
  });

  const stats = new Map<string, SourceStats>();
  for (const item of history) {
    const key = sourceKey(item);
    if (!key) continue;
    const ageDays = (nowMs - item.publishedAt.getTime()) / DAY_MS;
    const settled = item.seen || item.vote !== 0 || ageDays > maxAgeDays;
    if (!settled) continue;

    const mult =
      item.vote === 1 ? upvoteWeight : item.vote === -1 ? downvoteWeight : 1;
    const weight = Math.pow(0.5, ageDays / halfLifeDays) * mult;
    const positive =
      item.vote === 1 ? true : item.vote === -1 ? false : item.seen;

    let entry = stats.get(key);
    if (!entry) {
      entry = { overall: emptyAgg(), buckets: new Map() };
      stats.set(key, entry);
    }
    entry.overall.wTotal += weight;
    if (positive) entry.overall.wSeen += weight;

    if (item.durationSeconds != null) {
      const b = durationBucket(item.durationSeconds);
      let bAgg = entry.buckets.get(b);
      if (!bAgg) {
        bAgg = emptyAgg();
        entry.buckets.set(b, bAgg);
      }
      bAgg.wTotal += weight;
      if (positive) bAgg.wSeen += weight;
    }
  }

  const priorMean = priorAlpha / (priorAlpha + priorBeta);

  function sourceScore(key: string | null): number {
    if (!key) return priorMean;
    const entry = stats.get(key);
    if (!entry) return priorMean;
    return (
      (entry.overall.wSeen + priorAlpha) /
      (entry.overall.wTotal + priorAlpha + priorBeta)
    );
  }

  function itemScore(item: RankedItem): number {
    const key = sourceKey(item);
    const base = sourceScore(key);
    if (item.durationSeconds == null || !key) return base;
    const bAgg = stats.get(key)?.buckets.get(durationBucket(item.durationSeconds));
    const wSeen = bAgg?.wSeen ?? 0;
    const wTotal = bAgg?.wTotal ?? 0;
    return (
      (wSeen + durationBackoffCount * base) / (wTotal + durationBackoffCount)
    );
  }

  const candidates: RankedItem[] = await prisma.feedItem.findMany({
    where: {
      seen: false,
      vote: { not: -1 },
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
      vote: true,
      durationSeconds: true,
      trackedChannelId: true,
      trackedAnimeId: true,
      trackedGameId: true,
      trackedChannel: { select: { title: true, thumbnail: true } },
      trackedAnime: { select: { title: true, coverImage: true } },
      trackedGame: { select: { name: true, image: true } },
    },
  });

  const ranked = candidates
    .map((item) => ({ item, score: itemScore(item) }))
    .sort((a, b) => b.score - a.score);

  if (!options.diversify) return ranked.slice(0, options.limit);

  // Greedy pick with a per-source cap; relax it only if we can't otherwise
  // fill `limit` (few distinct sources have candidates).
  const picked: ScoredItem[] = [];
  const perSource = new Map<string, number>();
  for (const scored of ranked) {
    if (picked.length >= options.limit) break;
    const key = sourceKey(scored.item) ?? "__none__";
    if ((perSource.get(key) ?? 0) >= digestMaxPerSource) continue;
    picked.push(scored);
    perSource.set(key, (perSource.get(key) ?? 0) + 1);
  }
  if (picked.length < options.limit) {
    const pickedIds = new Set(picked.map((s) => s.item.id));
    for (const scored of ranked) {
      if (picked.length >= options.limit) break;
      if (!pickedIds.has(scored.item.id)) picked.push(scored);
    }
  }
  return picked;
}

export async function rankCandidates(options: {
  limit: number;
  excludeNotified: boolean;
  diversify?: boolean;
  params?: Partial<RecoParams>;
}): Promise<RankedItem[]> {
  return (await rankCandidatesScored(options)).map((scored) => scored.item);
}
