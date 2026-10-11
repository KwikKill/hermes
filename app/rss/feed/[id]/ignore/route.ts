import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Toggles the "ignored" flag on a FeedItem - skip a recommendation without
// watching it, so it stops sitting at the top of the ranking. Lives under
// /rss/ for the same reason as the seen toggle: only /rss/* is outside the
// Authentik gate and the widget's fetch can't do an SSO login.
// Ignoring clears `seen` (the two are mutually exclusive).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body: { ignored?: boolean } = await request.json().catch(() => ({}));

  if (typeof body.ignored !== "boolean") {
    return NextResponse.json(
      { error: "Body must be { ignored: boolean }" },
      { status: 400 }
    );
  }

  const item = await prisma.feedItem.update({
    where: { id },
    data: body.ignored ? { ignored: true, seen: false } : { ignored: false },
  });

  return NextResponse.json({ id: item.id, ignored: item.ignored, seen: item.seen });
}
