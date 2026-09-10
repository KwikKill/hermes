// Shared shape for anything a poller finds - upserted into FeedItem.
export interface FeedEntry {
  guid: string;
  title: string;
  link: string;
  description: string | null;
  publishedAt: Date;
  // YouTube only - runtime in seconds, used by the per-channel duration
  // preference in the recommender. null/undefined for anime & games.
  durationSeconds?: number | null;
}
