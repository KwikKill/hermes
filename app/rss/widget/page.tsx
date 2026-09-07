"use client";

import { useEffect, useState, useCallback } from "react";

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

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const CATEGORY_STYLES: Record<FeedItemPayload["category"], string> = {
  YOUTUBE: "bg-red-500/15 text-red-400",
  ANIME: "bg-purple-500/15 text-purple-400",
  GAMES: "bg-teal-500/15 text-teal-400",
};

export default function HermesWidgetPage() {
  const [items, setItems] = useState<FeedItemPayload[] | null>(null);

  const load = useCallback(async (): Promise<FeedItemPayload[]> => {
    const res = await fetch("/rss/feed/all", { cache: "no-store" });
    const data: { items: FeedItemPayload[] } = await res.json();
    return data.items;
  }, []);

  // Race-safe fetch-on-mount + polling: `ignore` skips the setState if this
  // effect was cleaned up before an in-flight request resolved.
  useEffect(() => {
    let ignore = false;

    (async () => {
      const items = await load();
      if (!ignore) setItems(items);
    })();

    const interval = setInterval(() => {
      (async () => {
        const items = await load();
        if (!ignore) setItems(items);
      })();
    }, REFRESH_INTERVAL_MS);

    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [load]);

  const toggleSeen = async (id: string, seen: boolean) => {
    setItems((current) =>
      current?.map((item) => (item.id === id ? { ...item, seen } : item)) ?? null
    );

    const res = await fetch(`/rss/feed/${id}/seen`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seen }),
    });

    if (!res.ok) {
      // Revert on failure - the optimistic update above was wrong.
      setItems((current) =>
        current?.map((item) => (item.id === id ? { ...item, seen: !seen } : item)) ??
        null
      );
    }
  };

  if (items === null) {
    return (
      <main className="flex h-screen items-center justify-center text-sm text-neutral-400">
        Chargement...
      </main>
    );
  }

  const upcoming = items.filter((item) => item.isFuture);
  const recent = items.filter((item) => !item.isFuture);

  return (
    <main className="flex h-screen flex-col gap-3 p-3">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-base font-bold">Hermes Feed</h1>
        <span className="rounded-full bg-neutral-500/15 px-2.5 py-0.5 text-xs text-neutral-400">
          {items.length} items
        </span>
      </div>

      {upcoming.length > 0 && (
        <details className="shrink-0 rounded-lg border border-neutral-500/20">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
            Upcoming ({upcoming.length})
          </summary>
          <div className="flex flex-col gap-2 border-t border-neutral-500/20 p-2">
            {upcoming.map((item) => (
              <FeedCard key={item.id} item={item} onToggleSeen={toggleSeen} />
            ))}
          </div>
        </details>
      )}

      <div className="flex shrink-0 items-center gap-2 text-xs text-neutral-400">
        <span className="h-px flex-1 bg-neutral-500/20" />
        Recent
        <span className="h-px flex-1 bg-neutral-500/20" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {recent.map((item) => (
          <FeedCard key={item.id} item={item} onToggleSeen={toggleSeen} />
        ))}
      </div>
    </main>
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
      className="flex items-start gap-2 rounded-lg border border-neutral-500/20 p-2 transition-opacity"
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
            <span className="truncate text-[11px] text-neutral-400">{item.source}</span>
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
          <p className="line-clamp-2 text-xs text-neutral-400">{item.description}</p>
        )}
        <p className="text-[11px] text-neutral-500">{item.publishedAtDisplay}</p>
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
