"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type FeedItemPayload = {
  id: string;
  category: "YOUTUBE" | "ANIME" | "GAMES";
  title: string;
  link: string;
  description: string | null;
  source: string | null;
  image: string | null;
  seen: boolean;
  isFuture: boolean;
  publishedAtDisplay: string;
};

type FeedResponse = {
  upcoming: FeedItemPayload[];
  recent: FeedItemPayload[];
  recentTotal: number;
  page: number;
  pageSize: number;
};

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const PAGE_SIZE = 8;

const CATEGORY_STYLES: Record<FeedItemPayload["category"], string> = {
  YOUTUBE: "bg-red-500/15 text-red-400",
  ANIME: "bg-purple-500/15 text-purple-400",
  GAMES: "bg-teal-500/15 text-teal-400",
};

export default function HermesWidgetPage() {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [page, setPage] = useState(1);
  // undefined = still loading, null = nothing to recommend right now.
  const [nextItem, setNextItem] = useState<FeedItemPayload | null | undefined>(undefined);
  const recentListRef = useRef<HTMLDivElement>(null);

  const loadNext = useCallback(async (): Promise<FeedItemPayload | null> => {
    const res = await fetch("/rss/feed/next", { cache: "no-store" });
    const result: { item: FeedItemPayload | null } = await res.json();
    return result.item;
  }, []);

  // Same race-safe fetch + polling pattern as the main list below, kept
  // separate since "next media" isn't paginated and refreshes independently
  // of which page of "Recent" is showing.
  useEffect(() => {
    let ignore = false;

    (async () => {
      const item = await loadNext();
      if (!ignore) setNextItem(item);
    })();

    const interval = setInterval(() => {
      (async () => {
        const item = await loadNext();
        if (!ignore) setNextItem(item);
      })();
    }, REFRESH_INTERVAL_MS);

    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [loadNext]);

  // Pagination should feel like a fresh page, not a scroll-preserving
  // in-place update - snap the "Recent" list back to its top on every page
  // change (not on the periodic auto-refresh, which keeps the same page).
  useEffect(() => {
    recentListRef.current?.scrollTo({ top: 0 });
  }, [page]);

  const load = useCallback(async (pageToLoad: number): Promise<FeedResponse> => {
    const res = await fetch(`/rss/feed/all?page=${pageToLoad}&pageSize=${PAGE_SIZE}`, {
      cache: "no-store",
    });
    return res.json();
  }, []);

  // Race-safe fetch + polling: `ignore` skips the setState if this effect
  // was cleaned up (page changed, or unmount) before the request resolved.
  useEffect(() => {
    let ignore = false;

    (async () => {
      const result = await load(page);
      if (!ignore) setData(result);
    })();

    const interval = setInterval(() => {
      (async () => {
        const result = await load(page);
        if (!ignore) setData(result);
      })();
    }, REFRESH_INTERVAL_MS);

    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [load, page]);

  const toggleSeen = async (id: string, seen: boolean) => {
    setData((current) =>
      current
        ? {
            ...current,
            upcoming: current.upcoming.map((item) =>
              item.id === id ? { ...item, seen } : item
            ),
            recent: current.recent.map((item) =>
              item.id === id ? { ...item, seen } : item
            ),
          }
        : current
    );

    const res = await fetch(`/rss/feed/${id}/seen`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seen }),
    });

    if (!res.ok) {
      // Revert on failure - the optimistic update above was wrong.
      setData((current) =>
        current
          ? {
              ...current,
              upcoming: current.upcoming.map((item) =>
                item.id === id ? { ...item, seen: !seen } : item
              ),
              recent: current.recent.map((item) =>
                item.id === id ? { ...item, seen: !seen } : item
              ),
            }
          : current
      );
      return;
    }

    // Any seen/unseen change can move the ranking - re-pull the current
    // best recommendation (this is how "mark as read -> next suggestion
    // appears" actually happens, there's no local next-in-line to fall
    // back to since ranking depends on live seen-ratios).
    setNextItem(await loadNext());
  };

  if (data === null) {
    return (
      <main className="flex h-screen items-center justify-center bg-card text-sm text-muted">
        Chargement...
      </main>
    );
  }

  const { upcoming, recent, recentTotal } = data;
  const pageCount = Math.max(1, Math.ceil(recentTotal / PAGE_SIZE));
  const totalItems = recentTotal + upcoming.length;

  return (
    <main className="flex h-screen flex-col gap-3 bg-card p-3">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-base font-bold">Hermes Feed</h1>
        <span className="rounded-full bg-card-item border border-card-border px-2.5 py-0.5 text-xs text-muted">
          {totalItems} items
        </span>
      </div>

      {page === 1 && nextItem !== undefined && (
        <NextUpCard item={nextItem} onToggleSeen={toggleSeen} />
      )}

      {upcoming.length > 0 && (
        <details className="shrink-0 rounded-lg border border-card-border bg-card-item">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
            Upcoming ({upcoming.length})
          </summary>
          <div className="flex flex-col gap-2 border-t border-card-border p-2">
            {upcoming.map((item) => (
              <FeedCard key={item.id} item={item} onToggleSeen={toggleSeen} />
            ))}
          </div>
        </details>
      )}

      <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
        <span className="h-px flex-1 bg-card-border" />
        Recent
        <span className="h-px flex-1 bg-card-border" />
      </div>

      <div ref={recentListRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {recent.map((item) => (
          <FeedCard key={item.id} item={item} onToggleSeen={toggleSeen} />
        ))}
      </div>

      {pageCount > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-3 text-xs">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-card-border bg-card-item px-2.5 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            &larr;
          </button>
          <span className="text-muted">
            Page {page} / {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            className="rounded-md border border-card-border bg-card-item px-2.5 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            &rarr;
          </button>
        </div>
      )}
    </main>
  );
}

function NextUpCard({
  item,
  onToggleSeen,
}: {
  item: FeedItemPayload | null;
  onToggleSeen: (id: string, seen: boolean) => void;
}) {
  return (
    <div className="shrink-0 rounded-lg border-2 border-teal-500/50 bg-card-item p-2">
      <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-teal-400 uppercase">
        Prochain media a regarder
      </p>

      {item === null ? (
        <p className="text-xs text-muted">Rien a recommander pour l&apos;instant.</p>
      ) : (
        <div className="flex items-start gap-2">
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image}
              alt=""
              className="h-12 w-12 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-sm font-bold ${CATEGORY_STYLES[item.category]}`}
            >
              {item.category.slice(0, 1)}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_STYLES[item.category]}`}
              >
                {item.category}
              </span>
              {item.source && (
                <span className="truncate text-[11px] text-muted">{item.source}</span>
              )}
            </div>
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="block text-sm font-semibold leading-snug hover:underline"
            >
              {item.title}
            </a>
          </div>

          <input
            type="checkbox"
            checked={false}
            onChange={(e) => onToggleSeen(item.id, e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-teal-500"
            aria-label="Marquer comme vu"
          />
        </div>
      )}
    </div>
  );
}

function FeedCard({
  item,
  onToggleSeen,
}: {
  item: FeedItemPayload;
  onToggleSeen: (id: string, seen: boolean) => void;
}) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-card-border bg-card-item p-2 transition-opacity"
      style={{ opacity: item.seen ? 0.5 : 1 }}
    >
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
      ) : (
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-xs font-bold ${CATEGORY_STYLES[item.category]}`}
        >
          {item.category.slice(0, 1)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_STYLES[item.category]}`}>
            {item.category}
          </span>
          {item.source && (
            <span className="truncate text-[11px] text-muted">{item.source}</span>
          )}
        </div>
        <a
          href={item.link}
          target="_blank"
          rel="noreferrer"
          className={`block text-sm font-semibold leading-snug hover:underline ${item.seen ? "line-through" : ""}`}
        >
          {item.title}
        </a>
        {item.description && (
          <p className="line-clamp-2 text-xs text-muted">{item.description}</p>
        )}
        <p className="text-[11px] text-muted">{item.publishedAtDisplay}</p>
      </div>

      <input
        type="checkbox"
        checked={item.seen}
        onChange={(e) => onToggleSeen(item.id, e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-teal-500"
        aria-label={item.seen ? "Marquer comme non vu" : "Marquer comme vu"}
      />
    </div>
  );
}
