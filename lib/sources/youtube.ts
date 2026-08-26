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

// Search for channels by name - the only call that needs YOUTUBE_API_KEY.
export async function searchYoutubeChannels(
  query: string
): Promise<YoutubeChannelResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is not configured");
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "channel");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("key", apiKey);

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

// Polls a channel's public RSS feed - no API key or quota involved.
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

  return rawEntries
    .filter((entry) => entry["yt:videoId"] && entry.title && entry.published)
    .map((entry) => ({
      guid: `youtube:${entry["yt:videoId"]}`,
      title: String(entry.title),
      link: `https://www.youtube.com/watch?v=${entry["yt:videoId"]}`,
      description: entry["media:group"]?.["media:description"] ?? null,
      publishedAt: new Date(entry.published as string),
    }));
}
