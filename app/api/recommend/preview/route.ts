import { NextRequest, NextResponse } from "next/server";
import { rankCandidatesScored, sourceLabel, sourceImage } from "@/lib/recommend";

// Runs the ranking with the params passed in the body WITHOUT persisting
// them - the tuning page (/recommend) calls this on every slider change to
// show the effect before the user decides to save. excludeNotified is false
// so it shows the true ranking, not a digest simulation.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const scored = await rankCandidatesScored({
    limit: 20,
    excludeNotified: false,
    params: body?.params,
  });

  return NextResponse.json({
    items: scored.map(({ item, score }) => ({
      id: item.id,
      category: item.category,
      title: item.title,
      link: item.link,
      source: sourceLabel(item),
      image: sourceImage(item),
      score,
    })),
  });
}
