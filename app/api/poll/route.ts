import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchChannelVideos } from "@/lib/sources/youtube";
import { fetchAnimeEpisodes } from "@/lib/sources/anime";
import { fetchGameRelease } from "@/lib/sources/games";
import type { FeedEntry } from "@/lib/sources/types";

// Called by the hermes-cron sidecar (see hermes/cron/refresh.sh) every 30
// minutes. Fetches every source for every tracked item and inserts any
// FeedItem row not already seen (guid is unique, skipDuplicates makes this
// a no-op for anything already stored). Each inserted row is linked back to
// its tracked source (trackedChannelId/trackedAnimeId/trackedGameId) so
// untracking that source cascades to delete its items - see
// prisma/schema.prisma.
export async function POST(request: NextRequest) {
  const secret = process.env.HERMES_POLL_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const errors: string[] = [];
  let created = 0;

  // --- YouTube ---
  const channels = await prisma.trackedChannel.findMany();
  for (const channel of channels) {
    try {
      const entries = await fetchChannelVideos(channel.channelId);
      created += await insertNewItems("YOUTUBE", entries, {
        trackedChannelId: channel.id,
      });
    } catch (err) {
      errors.push(`youtube:${channel.channelId}: ${errorMessage(err)}`);
    }
  }

  // --- Anime ---
  const anime = await prisma.trackedAnime.findMany();
  for (const show of anime) {
    try {
      const entries = await fetchAnimeEpisodes(show.anilistId);
      created += await insertNewItems("ANIME", entries, {
        trackedAnimeId: show.id,
      });
    } catch (err) {
      errors.push(`anime:${show.anilistId}: ${errorMessage(err)}`);
    }
  }

  // --- Games ---
  const games = await prisma.trackedGame.findMany();
  for (const game of games) {
    try {
      const { entry, releasedAt } = await fetchGameRelease(
        game.rawgId,
        game.lastReleasedAt
      );
      if (entry) {
        created += await insertNewItems("GAMES", [entry], {
          trackedGameId: game.id,
        });
      }
      if (releasedAt && releasedAt.getTime() !== game.lastReleasedAt?.getTime()) {
        await prisma.trackedGame.update({
          where: { id: game.id },
          data: { lastReleasedAt: releasedAt },
        });
      }
    } catch (err) {
      errors.push(`games:${game.rawgId}: ${errorMessage(err)}`);
    }
  }

  return NextResponse.json({ created, errors });
}

async function insertNewItems(
  category: "YOUTUBE" | "ANIME" | "GAMES",
  entries: FeedEntry[],
  source: {
    trackedChannelId?: string;
    trackedAnimeId?: string;
    trackedGameId?: string;
  }
): Promise<number> {
  if (entries.length === 0) return 0;
  const result = await prisma.feedItem.createMany({
    data: entries.map((entry) => ({ category, ...entry, ...source })),
    skipDuplicates: true,
  });
  return result.count;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
