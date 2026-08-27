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

interface AiringScheduleNode {
  episode: number;
  airingAt: number; // unix seconds
}

interface AniListEpisodesMedia {
  id: number;
  title: { romaji: string; english: string | null };
  siteUrl: string;
  airingSchedule: { nodes: AiringScheduleNode[] };
  streamingEpisodes: StreamingEpisode[];
}

// Extracts an episode number from AniList's streamingEpisodes titles, e.g.
// "Episode 12 - Some Title" -> 12. Best-effort: streaming providers don't
// always follow this exact format.
function parseEpisodeNumber(episodeTitle: string): number | null {
  const match = /episode\s+(\d+)/i.exec(episodeTitle);
  return match ? Number(match[1]) : null;
}

// `airingSchedule` is what actually carries a real per-episode air date
// (`airingAt`, unix seconds) - `streamingEpisodes` has no date field at all,
// only a title/thumbnail/url once a provider has it up. We use the former
// for the date and try to match the latter for a clickable link, falling
// back to the show's AniList page when no streaming link is found for that
// episode number.
export async function fetchAnimeEpisodes(anilistId: number): Promise<FeedEntry[]> {
  const gql = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title { romaji english }
        siteUrl
        airingSchedule(notYetAired: false, sort: TIME_DESC, perPage: 25) {
          nodes { episode airingAt }
        }
        streamingEpisodes { title thumbnail url }
      }
    }
  `;
  const data = await anilistQuery<{ Media: AniListEpisodesMedia }>(gql, {
    id: anilistId,
  });
  const media = data.Media;
  const showTitle = media.title.english ?? media.title.romaji;

  const streamingByEpisode = new Map<number, StreamingEpisode>();
  for (const ep of media.streamingEpisodes ?? []) {
    const num = parseEpisodeNumber(ep.title);
    if (num !== null && ep.url) streamingByEpisode.set(num, ep);
  }

  return (media.airingSchedule?.nodes ?? []).map((node) => {
    const streaming = streamingByEpisode.get(node.episode);
    return {
      guid: `anime:${anilistId}:${node.episode}`,
      title: `${showTitle} - Episode ${node.episode}`,
      link: streaming?.url ?? media.siteUrl,
      description: null,
      publishedAt: new Date(node.airingAt * 1000),
    };
  });
}
