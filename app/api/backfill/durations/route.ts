import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchVideoDurations } from "@/lib/sources/youtube";

// One batch of 50 = 1 YouTube quota unit. Call repeatedly (see
// scripts/backfill-durations.sh) until `remaining` hits 0.
const BATCH_SIZE = 50;

function videoIdFromGuid(guid: string): string | null {
  // guids are "youtube:<videoId>" (see lib/sources/youtube.ts).
  const match = /^youtube:(.+)$/.exec(guid);
  return match ? match[1] : null;
}

// Fills durationSeconds on YouTube FeedItem rows created before the field
// existed. Bearer-protected like /api/poll; not reachable from a browser.
export async function POST(request: NextRequest) {
  const secret = process.env.HERMES_POLL_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const batch = await prisma.feedItem.findMany({
    where: { category: "YOUTUBE", durationSeconds: null },
    select: { id: true, guid: true },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
  });

  if (batch.length === 0) {
    return NextResponse.json({ updated: 0, remaining: 0 });
  }

  const idToVideoId = new Map<string, string>();
  for (const row of batch) {
    const videoId = videoIdFromGuid(row.guid);
    if (videoId) idToVideoId.set(row.id, videoId);
  }

  const durations = await fetchVideoDurations([...idToVideoId.values()]);

  let updated = 0;
  await Promise.all(
    [...idToVideoId.entries()].map(async ([rowId, videoId]) => {
      const seconds = durations.get(videoId);
      if (seconds == null) return;
      await prisma.feedItem.update({
        where: { id: rowId },
        data: { durationSeconds: seconds },
      });
      updated += 1;
    })
  );

  const remaining = await prisma.feedItem.count({
    where: { category: "YOUTUBE", durationSeconds: null },
  });

  return NextResponse.json({ updated, remaining });
}
