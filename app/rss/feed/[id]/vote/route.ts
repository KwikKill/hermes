import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Sets the 👍 / 👎 vote on a FeedItem - called by the widget. Lives under
// /rss/ for the same reason as the seen toggle: only /rss/* is outside the
// Authentik gate and the widget's fetch can't do an SSO login.
// vote: -1 = "pas interesse" (also hides it from every recommendation),
// 0 = clear, +1 = liked.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body: { vote?: number } = await request.json().catch(() => ({}));

  if (body.vote !== -1 && body.vote !== 0 && body.vote !== 1) {
    return NextResponse.json(
      { error: "Body must be { vote: -1 | 0 | 1 }" },
      { status: 400 }
    );
  }

  const item = await prisma.feedItem.update({
    where: { id },
    data: { vote: body.vote, votedAt: body.vote === 0 ? null : new Date() },
  });

  return NextResponse.json({ id: item.id, vote: item.vote });
}
