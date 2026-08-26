import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const channels = await prisma.trackedChannel.findMany({
    orderBy: { addedAt: "desc" },
  });
  return NextResponse.json({ channels });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { channelId, title, thumbnail } = body as {
    channelId?: string;
    title?: string;
    thumbnail?: string | null;
  };

  if (!channelId || !title) {
    return NextResponse.json(
      { error: "channelId and title are required" },
      { status: 400 }
    );
  }

  const channel = await prisma.trackedChannel.upsert({
    where: { channelId },
    update: {},
    create: { channelId, title, thumbnail: thumbnail ?? null },
  });

  return NextResponse.json({ channel }, { status: 201 });
}
