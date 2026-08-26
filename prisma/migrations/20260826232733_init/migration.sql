-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FeedCategory" AS ENUM ('YOUTUBE', 'ANIME', 'GAMES');

-- CreateTable
CREATE TABLE "TrackedChannel" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnail" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedAnime" (
    "id" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "coverImage" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedAnime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedGame" (
    "id" TEXT NOT NULL,
    "rawgId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "lastReleasedAt" TIMESTAMP(3),
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedItem" (
    "id" TEXT NOT NULL,
    "category" "FeedCategory" NOT NULL,
    "guid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "description" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedChannel_channelId_key" ON "TrackedChannel"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedAnime_anilistId_key" ON "TrackedAnime"("anilistId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedGame_rawgId_key" ON "TrackedGame"("rawgId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedItem_guid_key" ON "FeedItem"("guid");

-- CreateIndex
CREATE INDEX "FeedItem_category_publishedAt_idx" ON "FeedItem"("category", "publishedAt");

