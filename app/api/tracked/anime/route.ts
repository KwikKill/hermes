import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const anime = await prisma.trackedAnime.findMany({
    orderBy: { addedAt: "desc" },
  });
  return NextResponse.json({ anime });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { anilistId, title, coverImage } = body as {
    anilistId?: number;
    title?: string;
    coverImage?: string | null;
  };

  if (!anilistId || !title) {
    return NextResponse.json(
      { error: "anilistId and title are required" },
      { status: 400 }
    );
  }

  const anime = await prisma.trackedAnime.upsert({
    where: { anilistId },
    update: {},
    create: { anilistId, title, coverImage: coverImage ?? null },
  });

  return NextResponse.json({ anime }, { status: 201 });
}
