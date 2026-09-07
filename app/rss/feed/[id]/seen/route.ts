import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Toggles/sets the "seen" flag on a FeedItem - called by the checkbox on
// /rss/widget (same-origin fetch, embedded in Homarr as an iframe widget).
// Lives under /rss/ (not /api/) on purpose: Caddy only excludes /rss/* from
// the Authentik forward_auth gate, and an iframe can't do an interactive SSO
// login. See Caddyfile.site.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body: { seen?: boolean } = await request.json().catch(() => ({}));

  if (typeof body.seen !== "boolean") {
    return NextResponse.json(
      { error: "Body must be { seen: boolean }" },
      { status: 400 }
    );
  }

  const item = await prisma.feedItem.update({
    where: { id },
    data: { seen: body.seen },
  });

  return NextResponse.json({ id: item.id, seen: item.seen });
}
