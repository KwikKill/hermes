import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Toggles/sets the "seen" flag on a FeedItem - called by the Homarr widget's
// checkbox. Lives under /rss/ (not /api/) on purpose: Caddy only excludes
// /rss/* from the Authentik forward_auth gate, and the widget's browser-side
// fetch can't do an interactive SSO login. See Caddyfile.site.
//
// CORS headers are set here rather than in Caddy: the widget calls this
// directly from the visitor's browser on the Homarr domain, unlike the GET
// /rss/feed/all data source which Homarr's own backend fetches server-side.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body: { seen?: boolean } = await request.json().catch(() => ({}));

  if (typeof body.seen !== "boolean") {
    return NextResponse.json(
      { error: "Body must be { seen: boolean }" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const item = await prisma.feedItem.update({
    where: { id },
    data: { seen: body.seen },
  });

  return NextResponse.json(
    { id: item.id, seen: item.seen },
    { headers: CORS_HEADERS }
  );
}
