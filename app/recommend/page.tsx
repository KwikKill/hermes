"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ItemActions, { type ItemActionHandlers } from "@/components/ItemActions";

type RecoParams = {
  halfLifeDays: number;
  priorAlpha: number;
  priorBeta: number;
  maxAgeDays: number;
  upvoteWeight: number;
  downvoteWeight: number;
  durationBackoffCount: number;
  digestMaxPerSource: number;
};

type PreviewItem = {
  id: string;
  category: "YOUTUBE" | "ANIME" | "GAMES";
  title: string;
  link: string;
  source: string;
  image: string | null;
  vote: number;
  score: number;
};

const CATEGORY_STYLES: Record<PreviewItem["category"], string> = {
  YOUTUBE: "bg-red-500/15 text-red-400",
  ANIME: "bg-purple-500/15 text-purple-400",
  GAMES: "bg-teal-500/15 text-teal-400",
};

const FIELDS: {
  key: keyof RecoParams;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}[] = [
  {
    key: "halfLifeDays",
    label: "Demi-vie de récence (jours)",
    hint: "Un item vu il y a ce nombre de jours pèse deux fois moins qu'un vu aujourd'hui. Plus haut = les goûts anciens comptent plus longtemps.",
    min: 7,
    max: 365,
    step: 1,
  },
  {
    key: "priorAlpha",
    label: "Prior α (pseudo-vus)",
    hint: "Observations fictives « vu » ajoutées à chaque source. Tire les sources peu documentées vers le haut.",
    min: 0.5,
    max: 10,
    step: 0.5,
  },
  {
    key: "priorBeta",
    label: "Prior β (pseudo-ignorés)",
    hint: "Observations fictives « ignoré ». α = β centre le prior sur 0.5 ; α + β est sa force.",
    min: 0.5,
    max: 10,
    step: 0.5,
  },
  {
    key: "maxAgeDays",
    label: "Fenêtre de fraîcheur (jours)",
    hint: "Âge maximum d'un item recommandable. Sert aussi de seuil « a eu sa chance » : un item plus vieux non vu devient un signal négatif ferme.",
    min: 1,
    max: 30,
    step: 1,
  },
  {
    key: "upvoteWeight",
    label: "Poids d'un 👍",
    hint: "Un 👍 sur un item compte comme ce nombre d'items « vus » pour le score de toute sa source.",
    min: 1,
    max: 10,
    step: 0.5,
  },
  {
    key: "downvoteWeight",
    label: "Poids d'un 👎",
    hint: "Idem côté négatif. Un 👎 masque aussi l'item de toutes les recommandations, quel que soit ce poids.",
    min: 1,
    max: 10,
    step: 0.5,
  },
  {
    key: "durationBackoffCount",
    label: "Repli durée (pseudo-obs)",
    hint: "Force du repli du score par tranche de durée vers le score global de la chaîne quand la tranche a peu de données. 0 = pas de repli.",
    min: 0,
    max: 20,
    step: 1,
  },
  {
    key: "digestMaxPerSource",
    label: "Max items / source (digest)",
    hint: "Plafond du nombre d'items d'une même source dans un digest Discord. Sans effet sur le widget ni sur cet aperçu.",
    min: 1,
    max: 8,
    step: 1,
  },
];

function paramsEqual(a: RecoParams, b: RecoParams): boolean {
  return FIELDS.every((f) => a[f.key] === b[f.key]);
}

export default function RecommendTuningPage() {
  const [saved, setSaved] = useState<RecoParams | null>(null);
  const [defaults, setDefaults] = useState<RecoParams | null>(null);
  const [draft, setDraft] = useState<RecoParams | null>(null);
  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [savingState, setSavingState] = useState<"idle" | "saving">("idle");
  // Bumped after marking an item seen/ignored, to re-run the preview.
  const [previewKey, setPreviewKey] = useState(0);

  // Load current + default params on mount.
  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch("/api/recommend/settings", { cache: "no-store" });
      const json: { params: RecoParams; defaults: RecoParams } = await res.json();
      if (!ignore) {
        setSaved(json.params);
        setDefaults(json.defaults);
        setDraft(json.params);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // Re-run the preview 350ms after the draft settles (or after an item was
  // marked seen/ignored).
  useEffect(() => {
    if (!draft) return;
    let ignore = false;
    const timeout = setTimeout(async () => {
      if (ignore) return;
      setPreviewing(true);
      const res = await fetch("/api/recommend/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params: draft }),
      });
      const json: { items: PreviewItem[] } = await res.json();
      if (!ignore) {
        setItems(json.items);
        setPreviewing(false);
      }
    }, 350);
    return () => {
      ignore = true;
      clearTimeout(timeout);
    };
  }, [draft, previewKey]);

  // Same controls / /rss/feed endpoints as the widget. Every candidate here
  // is unseen and not ignored, so checking "vu", ignoring or 👎 always drops
  // it from the ranking - remove it right away; a 👍 just updates in place.
  // Either way, re-run the preview afterwards since any of these reweights
  // the item's source.
  const sendPatch = async (id: string, endpoint: string, body: object) => {
    await fetch(`/rss/feed/${id}/${endpoint}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setPreviewKey((k) => k + 1);
  };

  const removeItem = (id: string) =>
    setItems((current) => current?.filter((item) => item.id !== id) ?? current);

  const actions: ItemActionHandlers = {
    onToggleSeen: (id, seen) => {
      if (seen) removeItem(id);
      sendPatch(id, "seen", { seen });
    },
    onToggleIgnored: (id, ignored) => {
      if (ignored) removeItem(id);
      sendPatch(id, "ignore", { ignored });
    },
    onVote: (id, vote) => {
      if (vote === -1) removeItem(id);
      else
        setItems(
          (current) =>
            current?.map((item) => (item.id === id ? { ...item, vote } : item)) ?? current
        );
      sendPatch(id, "vote", { vote });
    },
  };

  const setField = useCallback((key: keyof RecoParams, value: number) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const save = async () => {
    if (!draft) return;
    setSavingState("saving");
    const res = await fetch("/api/recommend/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params: draft }),
    });
    const json: { params: RecoParams } = await res.json();
    setSaved(json.params);
    setDraft(json.params);
    setSavingState("idle");
  };

  if (!draft || !saved || !defaults) {
    return (
      <main className="mx-auto w-full max-w-5xl p-4 text-sm text-muted sm:p-6">
        Chargement...
      </main>
    );
  }

  const dirty = !paramsEqual(draft, saved);
  const isDefault = paramsEqual(draft, defaults);

  return (
    // w-full: <body> is a flex column, and `mx-auto` on a flex item disables
    // the cross-axis stretch - without it <main> sizes to its content
    // (the nowrap titles below) instead of the viewport.
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <header className="mb-6">
        <div>
          <h1 className="text-2xl font-bold">Réglage des recommandations</h1>
          <p className="text-sm text-muted">
            Ces paramètres pilotent l&apos;algo pour toutes les sorties : digest Discord,
            carte « Prochain média » du widget, et cet aperçu.{" "}
            <Link href="/" className="underline">
              ← retour
            </Link>
          </p>
        </div>
      </header>

      {/* minmax(0, ...) tracks: a plain `1fr` / implicit `auto` column grows
          to the min-content width of the truncated titles and overflows. */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="flex flex-col gap-5 rounded-lg border border-card-border bg-card p-4">
          {FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={field.key} className="min-w-0 text-sm font-medium">
                  {field.label}
                </label>
                <input
                  id={field.key}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={draft[field.key]}
                  onChange={(e) => setField(field.key, Number(e.target.value))}
                  className="w-20 shrink-0 rounded border border-card-border bg-card-item px-1.5 py-0.5 text-right text-sm"
                />
              </div>
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={draft[field.key]}
                onChange={(e) => setField(field.key, Number(e.target.value))}
                className="accent-teal-500"
                aria-label={field.label}
              />
              <p className="text-xs text-muted">{field.hint}</p>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || savingState === "saving"}
              className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingState === "saving" ? "..." : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(defaults)}
              disabled={isDefault}
              className="rounded-md border border-card-border bg-card-item px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              Défauts
            </button>
          </div>
          {dirty && (
            <p className="text-xs text-amber-500">
              Modifications non enregistrées — l&apos;aperçu les reflète déjà, mais le
              digest et le widget utilisent encore les valeurs sauvegardées.
            </p>
          )}
        </section>

        <section className="@container flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>20 premières recommandations</span>
            {previewing && <span>calcul...</span>}
          </div>
          {items && items.length === 0 && (
            <p className="text-sm text-muted">
              Aucun candidat dans la fenêtre de fraîcheur actuelle.
            </p>
          )}
          <ol className="flex flex-col gap-1.5">
            {items?.map((item, index) => (
              // Container query (not viewport): the list column's width
              // depends on the grid above, so the row stacks its score +
              // actions under the title whenever the column itself is narrow.
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-lg border border-card-border bg-card-item p-2 @lg:flex-row @lg:items-center @lg:gap-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="w-5 shrink-0 text-right text-sm font-semibold text-muted tabular-nums">
                    {index + 1}
                  </span>
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold ${CATEGORY_STYLES[item.category]}`}
                    >
                      {item.category.slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_STYLES[item.category]}`}
                      >
                        {item.category}
                      </span>
                      <span className="min-w-0 truncate text-[11px] text-muted">
                        {item.source}
                      </span>
                    </div>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      title={item.title}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {item.title}
                    </a>
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  <div className="flex w-24 items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card-border">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{ width: `${Math.round(item.score * 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs tabular-nums text-muted">
                      {item.score.toFixed(3)}
                    </span>
                  </div>
                  <ItemActions
                    item={{ ...item, seen: false, ignored: false }}
                    actions={actions}
                  />
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
