import { NextResponse } from "next/server";
import { refreshYoutubeChannel } from "@/lib/refresh";

// Manual refetch of one tracked source - see lib/refresh.ts.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    return NextResponse.json(await refreshYoutubeChannel(id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
