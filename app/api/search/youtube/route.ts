import { NextRequest, NextResponse } from "next/server";
import { searchYoutubeChannels } from "@/lib/sources/youtube";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Missing ?q=" }, { status: 400 });
  }

  try {
    const results = await searchYoutubeChannels(q);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 502 }
    );
  }
}
