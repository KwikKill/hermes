import type { FeedEntry } from "./types";

const ANILIST_API = "https://graphql.anilist.co";

async function anilistQuery<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await fetch(ANILIST_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`AniList request failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(`AniList error: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

interface AniListSearchMedia {
  id: number;
  title: { romaji: string; english: string | null };
  coverImage: { medium: string | null };
}

export interface AnimeSearchResult {
  anilistId: number;
  title: string;
  coverImage: string | null;
}

// No API key needed - AniList's GraphQL API is public.
export async function searchAnime(query: string): Promise<AnimeSearchResult[]> {
  const gql = `
    query ($search: String) {
      Page(perPage: 10) {
        media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
          id
          title { romaji english }
          coverImage { medium }
        }
      }
    }
  `;
  const data = await anilistQuery<{ Page: { media: AniListSearchMedia[] } }>(
    gql,
    { search: query }
  );
  return data.Page.media.map((m) => ({
    anilistId: m.id,
    title: m.title.english ?? m.title.romaji,
    coverImage: m.coverImage?.medium ?? null,
  }));
}

interface StreamingEpisode {
  title: string;
  thumbnail: string | null;
  url: string;
}

interface AniListEpisodesMedia {
  id: number;
  title: { romaji: string; english: string | null };
  streamingEpisodes: StreamingEpisode[];
}

// AniList's `streamingEpisodes` field lists episodes it knows are
// available on legal streaming platforms - this is the closest thing to
// "episode released" AniList exposes without needing a key. It has no
// per-episode air date, so publishedAt is "when we first saw it" rather
// than the real air date - fine for feed ordering/dedup purposes (the
// caller only creates a FeedItem for guids never seen before).
export async function fetchAnimeEpisodes(anilistId: number): Promise<FeedEntry[]> {
  const gql = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title { romaji english }
        streamingEpisodes { title thumbnail url }
      }
    }
  `;
  const data = await anilistQuery<{ Media: AniListEpisodesMedia }>(gql, {
    id: anilistId,
  });
  const media = data.Media;
  const showTitle = media.title.english ?? media.title.romaji;

  return (media.streamingEpisodes ?? [])
    .filter((ep) => ep.url)
    .map((ep) => ({
      guid: `anime:${anilistId}:${ep.url}`,
      title: `${showTitle} - ${ep.title}`,
      link: ep.url,
      description: null,
      publishedAt: new Date(),
    }));
}
