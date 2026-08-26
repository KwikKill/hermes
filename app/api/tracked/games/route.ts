import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const games = await prisma.trackedGame.findMany({
    orderBy: { addedAt: "desc" },
  });
  return NextResponse.json({ games });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { rawgId, name, image } = body as {
    rawgId?: number;
    name?: string;
    image?: string | null;
  };

  if (!rawgId || !name) {
    return NextResponse.json(
      { error: "rawgId and name are required" },
      { status: 400 }
    );
  }

  const game = await prisma.trackedGame.upsert({
    where: { rawgId },
    update: {},
    create: { rawgId, name, image: image ?? null },
  });

  return NextResponse.json({ game }, { status: 201 });
}
