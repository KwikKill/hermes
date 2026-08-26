// Shared shape for anything a poller finds - upserted into FeedItem.
export interface FeedEntry {
  guid: string;
  title: string;
  link: string;
  description: string | null;
  publishedAt: Date;
}
