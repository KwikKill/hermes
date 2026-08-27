-- AlterTable
ALTER TABLE "FeedItem" ADD COLUMN     "trackedAnimeId" TEXT,
ADD COLUMN     "trackedChannelId" TEXT,
ADD COLUMN     "trackedGameId" TEXT;

-- AddForeignKey
ALTER TABLE "FeedItem" ADD CONSTRAINT "FeedItem_trackedChannelId_fkey" FOREIGN KEY ("trackedChannelId") REFERENCES "TrackedChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedItem" ADD CONSTRAINT "FeedItem_trackedAnimeId_fkey" FOREIGN KEY ("trackedAnimeId") REFERENCES "TrackedAnime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedItem" ADD CONSTRAINT "FeedItem_trackedGameId_fkey" FOREIGN KEY ("trackedGameId") REFERENCES "TrackedGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
