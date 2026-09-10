import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rankCandidates, sourceLabel, type Category, type RankedItem } from "@/lib/recommend";

const DEFAULT_MAX_ITEMS = 8;

const CATEGORY_EMOJI: Record<Category, string> = {
  YOUTUBE: "\u{1F4FA}",
  ANIME: "\u{1F3AC}",
  GAMES: "\u{1F3AE}",
};

async function sendDiscordDigest(webhookUrl: string, items: RankedItem[]): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Hermes",
      embeds: [
        {
          title: "Ce soir, tu pourrais aimer...",
          color: 0x2f6f5e,
          fields: items.map((item) => ({
            name: `${CATEGORY_EMOJI[item.category]} ${sourceLabel(item)}`.slice(0, 256),
            value: `[${item.title}](${item.link})`.slice(0, 1024),
          })),
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Discord webhook failed: ${res.status} ${await res.text()}`);
  }
}

// Called by the hermes-cron sidecar every evening (see
// hermes/cron/digest.sh + crontab) - a curated nightly nudge, not a
// notification for every new item (there'd be far too many to actually look
// at). Picks the items the user is statistically most likely to care about
// (see lib/recommend.ts) and posts them to a Discord webhook. Each notified
// item is marked so it's never suggested again, whether or not it then gets
// marked "seen".
export async function POST(request: NextRequest) {
  const secret = process.env.HERMES_POLL_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.HERMES_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ sent: 0, reason: "no-webhook-configured" });
  }

  const maxItems = Number(process.env.HERMES_DIGEST_MAX_ITEMS) || DEFAULT_MAX_ITEMS;
  const items = await rankCandidates({
    limit: maxItems,
    excludeNotified: true,
    diversify: true,
  });

  if (items.length === 0) {
    return NextResponse.json({ sent: 0, reason: "no-candidates" });
  }

  await sendDiscordDigest(webhookUrl, items);

  await prisma.feedItem.updateMany({
    where: { id: { in: items.map((item) => item.id) } },
    data: { notifiedAt: new Date() },
  });

  return NextResponse.json({ sent: items.length });
}
