import { prisma } from "@/lib/prisma";
import { fetchChannelVideos } from "@/lib/sources/youtube";
import { fetchAnimeEpisodes } from "@/lib/sources/anime";
import { fetchGameRelease } from "@/lib/sources/games";
import type { FeedEntry } from "@/lib/sources/types";

type SourceLink = {
  trackedChannelId?: string;
  trackedAnimeId?: string;
  trackedGameId?: string;
};

export type RefreshResult = { created: number; updated: number };

// Like the poll's insert, but also rewrites the content fields (title,
// link, description, publishedAt, duration) of items already stored - the
// regular poll never touches an existing guid, so a date that changed
// upstream (typically AniList filling in real per-episode air dates) would
// otherwise stay wrong forever. User state (seen / ignored / vote /
// notifiedAt) is left untouched.
async function syncFeedItems(
  category: "YOUTUBE" | "ANIME" | "GAMES",
  entries: FeedEntry[],
  source: SourceLink
): Promise<RefreshResult> {
  if (entries.length === 0) return { created: 0, updated: 0 };

  const existing = await prisma.feedItem.findMany({
    where: { guid: { in: entries.map((e) => e.guid) } },
    select: {
      id: true,
      guid: true,
      title: true,
      link: true,
      description: true,
      publishedAt: true,
      durationSeconds: true,
    },
  });
  const byGuid = new Map(existing.map((row) => [row.guid, row]));

  let updated = 0;
  const toCreate: FeedEntry[] = [];
  for (const entry of entries) {
    const row = byGuid.get(entry.guid);
    if (!row) {
      toCreate.push(entry);
      continue;
    }
    // Never replace a known duration with "unknown".
    const durationSeconds = entry.durationSeconds ?? row.durationSeconds;
    const changed =
      row.title !== entry.title ||
      row.link !== entry.link ||
      row.description !== entry.description ||
      row.publishedAt.getTime() !== entry.publishedAt.getTime() ||
      row.durationSeconds !== durationSeconds;
    if (!changed) continue;

    await prisma.feedItem.update({
      where: { id: row.id },
      data: {
        title: entry.title,
        link: entry.link,
        description: entry.description,
        publishedAt: entry.publishedAt,
        durationSeconds,
      },
    });
    updated++;
  }

  const { count: created } = toCreate.length
    ? await prisma.feedItem.createMany({
        data: toCreate.map((entry) => ({ category, ...entry, ...source })),
        skipDuplicates: true,
      })
    : { count: 0 };

  return { created, updated };
}

// Manual "refetch this source" from the tracking page (TrackerSection).
// Throws if the tracked row doesn't exist (prisma findUniqueOrThrow).
export async function refreshYoutubeChannel(id: string): Promise<RefreshResult> {
  const channel = await prisma.trackedChannel.findUniqueOrThrow({ where: { id } });
  const entries = await fetchChannelVideos(channel.channelId, channel.title);
  return syncFeedItems("YOUTUBE", entries, { trackedChannelId: channel.id });
}

export async function refreshAnime(id: string): Promise<RefreshResult> {
  const show = await prisma.trackedAnime.findUniqueOrThrow({ where: { id } });
  const entries = await fetchAnimeEpisodes(show.anilistId, { allPages: true });
  return syncFeedItems("ANIME", entries, { trackedAnimeId: show.id });
}

export async function refreshGame(id: string): Promise<RefreshResult> {
  const game = await prisma.trackedGame.findUniqueOrThrow({ where: { id } });
  // lastKnownReleasedAt = null so the current release entry is always
  // produced; syncFeedItems dedupes it by guid.
  const { entry, releasedAt } = await fetchGameRelease(game.rawgId, null);
  const result = entry
    ? await syncFeedItems("GAMES", [entry], { trackedGameId: game.id })
    : { created: 0, updated: 0 };
  if (releasedAt && releasedAt.getTime() !== game.lastReleasedAt?.getTime()) {
    await prisma.trackedGame.update({
      where: { id: game.id },
      data: { lastReleasedAt: releasedAt },
    });
  }
  return result;
}
