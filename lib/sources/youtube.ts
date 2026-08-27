import { XMLParser } from "fast-xml-parser";
import type { FeedEntry } from "./types";

export interface YoutubeChannelResult {
  channelId: string;
  title: string;
  thumbnail: string | null;
}

interface YoutubeSearchApiItem {
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    title?: string;
    thumbnails?: { default?: { url?: string } };
  };
  id?: { channelId?: string };
}

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not configured");
  return key;
}

// Search for channels by name.
export async function searchYoutubeChannels(
  query: string
): Promise<YoutubeChannelResult[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "channel");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("key", apiKey());

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube search failed: ${res.status} ${await res.text()}`);
  }

  const data: { items?: YoutubeSearchApiItem[] } = await res.json();
  return (data.items ?? [])
    .map((item) => ({
      channelId: item.snippet?.channelId ?? item.id?.channelId ?? "",
      title: item.snippet?.channelTitle ?? item.snippet?.title ?? "",
      thumbnail: item.snippet?.thumbnails?.default?.url ?? null,
    }))
    .filter((c) => c.channelId && c.title);
}

const xmlParser = new XMLParser({ ignoreAttributes: false });

interface YoutubeFeedEntryXml {
  "yt:videoId"?: string;
  title?: string;
  published?: string;
  "media:group"?: { "media:description"?: string };
}

// Parses ISO 8601 durations as returned by the Data API ("PT1M30S", "PT45S",
// "PT2H10M5S") into total seconds.
function parseIso8601Duration(duration: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) return 0;
  const [, hours, minutes, seconds] = match;
  return (
    Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)
  );
}

// Videos this short or shorter are treated as Shorts and filtered out.
// YouTube's own Shorts limit moved from 60s to 3min in 2024, but there's no
// reliable "is this a Short" flag on the public API - duration is the best
// available signal, so this only catches the classic/most common case.
const SHORT_MAX_SECONDS = 60;

// `videos.list` costs 1 quota unit total regardless of how many ids are
// passed (up to 50) - cheap enough to call on every poll for the handful of
// new videos a channel's feed returns.
async function fetchVideoDurations(videoIds: string[]): Promise<Map<string, number>> {
  const durations = new Map<string, number>();
  if (videoIds.length === 0) return durations;

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", videoIds.join(","));
  url.searchParams.set("key", apiKey());

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube videos.list failed: ${res.status} ${await res.text()}`);
  }
  const data: { items?: { id: string; contentDetails?: { duration?: string } }[] } =
    await res.json();

  for (const item of data.items ?? []) {
    if (item.contentDetails?.duration) {
      durations.set(item.id, parseIso8601Duration(item.contentDetails.duration));
    }
  }
  return durations;
}

// Polls a channel's public RSS feed (no quota), then filters out Shorts by
// checking each new video's duration via the Data API (needs YOUTUBE_API_KEY).
export async function fetchChannelVideos(
  channelId: string
): Promise<FeedEntry[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube channel feed fetch failed: ${res.status}`);
  }

  const xml = await res.text();
  const parsed = xmlParser.parse(xml);
  const rawEntries: YoutubeFeedEntryXml[] = parsed?.feed?.entry
    ? [].concat(parsed.feed.entry)
    : [];

  const entries = rawEntries.filter(
    (entry) => entry["yt:videoId"] && entry.title && entry.published
  );

  const videoIds = entries.map((entry) => entry["yt:videoId"] as string);
  const durations = await fetchVideoDurations(videoIds);

  return entries
    .filter((entry) => {
      const duration = durations.get(entry["yt:videoId"] as string);
      // Keep videos whose duration we couldn't determine rather than drop
      // them silently - better a Short slips through than a real upload.
      return duration === undefined || duration > SHORT_MAX_SECONDS;
    })
    .map((entry) => ({
      guid: `youtube:${entry["yt:videoId"]}`,
      title: String(entry.title),
      link: `https://www.youtube.com/watch?v=${entry["yt:videoId"]}`,
      description: entry["media:group"]?.["media:description"] ?? null,
      publishedAt: new Date(entry.published as string),
    }));
}
