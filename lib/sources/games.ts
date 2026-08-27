import type { FeedEntry } from "./types";

const RAWG_API = "https://api.rawg.io/api";

function apiKey(): string {
  const key = process.env.RAWG_API_KEY;
  if (!key) throw new Error("RAWG_API_KEY is not configured");
  return key;
}

interface RawgGame {
  id: number;
  name: string;
  background_image: string | null;
  released: string | null;
}

export interface GameSearchResult {
  rawgId: number;
  name: string;
  image: string | null;
  released: string | null;
}

async function rawgSearch(
  query: string,
  extraParams: Record<string, string>
): Promise<RawgGame[]> {
  const url = new URL(`${RAWG_API}/games`);
  url.searchParams.set("key", apiKey());
  url.searchParams.set("search", query);
  for (const [k, v] of Object.entries(extraParams)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`RAWG search failed: ${res.status} ${await res.text()}`);
  }
  const data: { results: RawgGame[] } = await res.json();
  return data.results;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Higher is more relevant. Combines how closely the name matches the query
// with a small boost for games that haven't released yet, since those are
// usually what you're trying to track ahead of time (and RAWG's own
// relevance ranking tends to favor already-popular/reviewed games, burying
// exact-but-obscure/upcoming titles under loosely-related "contains a
// similar word" results).
function relevanceScore(name: string, query: string, released: string | null): number {
  const normalizedName = name.toLowerCase().trim();
  const normalizedQuery = query.toLowerCase().trim();

  let score = 0;
  if (normalizedName === normalizedQuery) {
    score += 1000;
  } else if (normalizedName.startsWith(normalizedQuery)) {
    score += 500;
  } else if (new RegExp(`\\b${escapeRegExp(normalizedQuery)}\\b`).test(normalizedName)) {
    // whole-word match ("rivage" in "the rivage chronicles"), not just a
    // substring inside a longer, unrelated word ("riva" inside "rivals")
    score += 200;
  } else if (normalizedName.includes(normalizedQuery)) {
    score += 50;
  }

  // Prefer names close in length to the query - a long name that merely
  // contains the query as a fragment is usually a weaker match.
  score -= Math.abs(normalizedName.length - normalizedQuery.length) * 0.5;

  const isUnreleased = !released || new Date(released).getTime() > Date.now();
  if (isUnreleased) score += 30;

  return score;
}

export async function searchGames(query: string): Promise<GameSearchResult[]> {
  // Two lookups in parallel: an exact-name match (catches games RAWG's own
  // fuzzy relevance ranking would otherwise bury or drop) and a broader
  // fuzzy search with a larger pool to re-rank ourselves.
  const [exactMatches, fuzzyMatches] = await Promise.all([
    rawgSearch(query, { search_exact: "true", page_size: "5" }),
    rawgSearch(query, { search_precise: "true", page_size: "20" }),
  ]);

  const byId = new Map<number, RawgGame>();
  for (const game of [...exactMatches, ...fuzzyMatches]) {
    if (!byId.has(game.id)) byId.set(game.id, game);
  }

  const exactIds = new Set(exactMatches.map((g) => g.id));
  const ranked = [...byId.values()].sort((a, b) => {
    const aExact = exactIds.has(a.id) ? 1 : 0;
    const bExact = exactIds.has(b.id) ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return (
      relevanceScore(b.name, query, b.released) -
      relevanceScore(a.name, query, a.released)
    );
  });

  return ranked.slice(0, 12).map((g) => ({
    rawgId: g.id,
    name: g.name,
    image: g.background_image,
    released: g.released,
  }));
}

export interface GamePollResult {
  entry: FeedEntry | null;
  releasedAt: Date | null;
}

// Games don't have "episodes" - a poll only produces a feed entry when the
// release date is new information (first time it's set, or changed from
// what's stored on TrackedGame.lastReleasedAt), so re-polling an
// already-released game doesn't spam a new item every time.
export async function fetchGameRelease(
  rawgId: number,
  lastKnownReleasedAt: Date | null
): Promise<GamePollResult> {
  const url = new URL(`${RAWG_API}/games/${rawgId}`);
  url.searchParams.set("key", apiKey());

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`RAWG game fetch failed: ${res.status}`);
  }
  const game: RawgGame = await res.json();
  const releasedAt = game.released ? new Date(game.released) : null;

  const isNewInfo =
    releasedAt !== null &&
    (lastKnownReleasedAt === null ||
      releasedAt.getTime() !== lastKnownReleasedAt.getTime());

  if (!isNewInfo || !releasedAt) {
    return { entry: null, releasedAt };
  }

  return {
    entry: {
      guid: `games:${rawgId}:${releasedAt.toISOString()}`,
      title: `[Game] ${game.name} - sorti le ${releasedAt.toLocaleDateString("fr-FR")}`,
      link: `https://rawg.io/games/${rawgId}`,
      description: null,
      publishedAt: releasedAt,
    },
    releasedAt,
  };
}
