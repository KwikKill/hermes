import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_PARAMS,
  getRecommendationSettings,
  saveRecommendationSettings,
} from "@/lib/recommend";

// Behind Authentik forward_auth (not under /rss/) - this is the admin
// tuning surface, same gate as the tracked-items UI.
export async function GET() {
  return NextResponse.json({
    params: await getRecommendationSettings(),
    defaults: DEFAULT_PARAMS,
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const params = await saveRecommendationSettings(body?.params ?? body);
  return NextResponse.json({ params });
}
