import { NextResponse } from "next/server";
import { rankCandidates, sourceLabel, sourceImage, type RankedItem } from "@/lib/recommend";

function toPayload(item: RankedItem) {
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    link: item.link,
    description: item.description,
    source: sourceLabel(item),
    image: sourceImage(item),
    seen: false,
    vote: item.vote,
    isFuture: false,
    publishedAtDisplay: "",
  };
}

// Powers the "Prochain media a regarder" card on /rss/widget - the single
// best recommendation right now, same ranking as the nightly digest (see
// lib/recommend.ts) but not filtered by notifiedAt: this is pulled by the
// user browsing, not a push notification, so it should always surface the
// current best pick even if that item was already mentioned in a digest.
export async function GET() {
  const [item] = await rankCandidates({ limit: 1, excludeNotified: false });
  return NextResponse.json({ item: item ? toPayload(item) : null });
}
