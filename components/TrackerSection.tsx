"use client";

import { useState, useEffect, useCallback } from "react";

export type Category = "youtube" | "anime" | "games";

interface SearchResult {
  externalId: string | number;
  label: string;
  image: string | null;
}

interface TrackedItem {
  id: string;
  externalId: string | number;
  label: string;
  image: string | null;
}

interface CategoryConfig {
  mapSearchResult: (raw: Record<string, unknown>) => SearchResult;
  mapTrackedItem: (raw: Record<string, unknown>) => TrackedItem;
  buildAddBody: (result: SearchResult) => Record<string, unknown>;
  trackedKey: string; // key of the array in GET /api/tracked/{category} responses
}

const CATEGORY_CONFIG: Record<Category, CategoryConfig> = {
  youtube: {
    trackedKey: "channels",
    mapSearchResult: (r) => ({
      externalId: r.channelId as string,
      label: r.title as string,
      image: (r.thumbnail as string | null) ?? null,
    }),
    mapTrackedItem: (r) => ({
      id: r.id as string,
      externalId: r.channelId as string,
      label: r.title as string,
      image: (r.thumbnail as string | null) ?? null,
    }),
    buildAddBody: (r) => ({
      channelId: r.externalId,
      title: r.label,
      thumbnail: r.image,
    }),
  },
  anime: {
    trackedKey: "anime",
    mapSearchResult: (r) => ({
      externalId: r.anilistId as number,
      label: r.title as string,
      image: (r.coverImage as string | null) ?? null,
    }),
    mapTrackedItem: (r) => ({
      id: r.id as string,
      externalId: r.anilistId as number,
      label: r.title as string,
      image: (r.coverImage as string | null) ?? null,
    }),
    buildAddBody: (r) => ({
      anilistId: r.externalId,
      title: r.label,
      coverImage: r.image,
    }),
  },
  games: {
    trackedKey: "games",
    mapSearchResult: (r) => ({
      externalId: r.rawgId as number,
      label: r.name as string,
      image: (r.image as string | null) ?? null,
    }),
    mapTrackedItem: (r) => ({
      id: r.id as string,
      externalId: r.rawgId as number,
      label: r.name as string,
      image: (r.image as string | null) ?? null,
    }),
    buildAddBody: (r) => ({
      rawgId: r.externalId,
      name: r.label,
      image: r.image,
    }),
  },
};

export default function TrackerSection({
  category,
  title,
}: {
  category: Category;
  title: string;
}) {
  const config = CATEGORY_CONFIG[category];
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [tracked, setTracked] = useState<TrackedItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTracked = useCallback(async () => {
    const res = await fetch(`/api/tracked/${category}`);
    if (!res.ok) return [];
    const data = await res.json();
    const rawItems = (data[config.trackedKey] ?? []) as Record<string, unknown>[];
    return rawItems.map(config.mapTrackedItem);
  }, [category, config]);

  // Race-safe fetch-on-mount: `ignore` skips the setState if this effect
  // was cleaned up (category changed) before the request resolved.
  const reloadTracked = useCallback(() => {
    let ignore = false;
    (async () => {
      const items = await fetchTracked();
      if (!ignore) setTracked(items);
    })();
    return () => {
      ignore = true;
    };
  }, [fetchTracked]);

  useEffect(() => reloadTracked(), [reloadTracked]);

  const trimmedQuery = query.trim();

  // Debounced search - fires 400ms after the user stops typing.
  useEffect(() => {
    if (!trimmedQuery) return;

    let ignore = false;

    const timeout = setTimeout(async () => {
      if (ignore) return;
      setSearching(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/search/${category}?q=${encodeURIComponent(trimmedQuery)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur de recherche");
        if (ignore) return;
        const rawResults = (data.results ?? []) as Record<string, unknown>[];
        setResults(rawResults.map(config.mapSearchResult));
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Erreur de recherche");
        setResults([]);
      } finally {
        if (!ignore) setSearching(false);
      }
    }, 400);

    return () => {
      ignore = true;
      clearTimeout(timeout);
    };
  }, [trimmedQuery, category, config]);

  async function addItem(result: SearchResult) {
    await fetch(`/api/tracked/${category}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config.buildAddBody(result)),
    });
    setTracked(await fetchTracked());
  }

  async function removeItem(id: string) {
    await fetch(`/api/tracked/${category}/${id}`, { method: "DELETE" });
    setTracked(await fetchTracked());
  }

  const trackedExternalIds = new Set(tracked.map((t) => String(t.externalId)));

  return (
    <section className="rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher..."
        className="mb-3 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
      />

      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      {searching && <p className="mb-2 text-sm text-neutral-500">Recherche...</p>}

      {trimmedQuery && results.length > 0 && (
        <ul className="mb-4 max-h-64 space-y-1 overflow-y-auto">
          {results.map((r) => (
            <li
              key={String(r.externalId)}
              className="flex items-center justify-between gap-2 rounded bg-neutral-900 px-2 py-1 text-sm"
            >
              <span className="flex items-center gap-2 truncate">
                {r.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.image} alt="" className="h-6 w-6 rounded object-cover" />
                )}
                <span className="truncate">{r.label}</span>
              </span>
              {trackedExternalIds.has(String(r.externalId)) ? (
                <span className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-500">
                  Déjà suivi
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => addItem(r)}
                  className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs hover:bg-blue-500"
                >
                  Ajouter
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 text-sm font-medium text-neutral-400">
        Suivis ({tracked.length})
      </h3>
      <ul className="space-y-1">
        {tracked.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-2 rounded bg-neutral-900 px-2 py-1 text-sm"
          >
            <span className="flex items-center gap-2 truncate">
              {t.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.image} alt="" className="h-6 w-6 rounded object-cover" />
              )}
              <span className="truncate">{t.label}</span>
            </span>
            <button
              type="button"
              onClick={() => removeItem(t.id)}
              className="shrink-0 rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-red-600"
            >
              Retirer
            </button>
          </li>
        ))}
        {tracked.length === 0 && (
          <li className="text-sm text-neutral-500">Rien de suivi pour l&apos;instant.</li>
        )}
      </ul>
    </section>
  );
}
