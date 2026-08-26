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

export async function searchGames(query: string): Promise<GameSearchResult[]> {
  const url = new URL(`${RAWG_API}/games`);
  url.searchParams.set("key", apiKey());
  url.searchParams.set("search", query);
  url.searchParams.set("page_size", "10");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`RAWG search failed: ${res.status} ${await res.text()}`);
  }
  const data: { results: RawgGame[] } = await res.json();
  return data.results.map((g) => ({
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
      title: `${game.name} - sorti le ${releasedAt.toLocaleDateString("fr-FR")}`,
      link: `https://rawg.io/games/${rawgId}`,
      description: null,
      publishedAt: releasedAt,
    },
    releasedAt,
  };
}
