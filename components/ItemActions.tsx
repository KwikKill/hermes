"use client";

export type ItemActionHandlers = {
  onToggleSeen: (id: string, seen: boolean) => void;
  onToggleIgnored: (id: string, ignored: boolean) => void;
  onVote: (id: string, vote: number) => void;
};

function VoteButtons({
  vote,
  onVote,
}: {
  vote: number;
  onVote: (vote: number) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5 text-xs leading-none">
      <button
        type="button"
        onClick={() => onVote(vote === 1 ? 0 : 1)}
        className={`transition-opacity ${vote === 1 ? "opacity-100" : "opacity-30 hover:opacity-70"}`}
        title="J'aime — booste la source"
        aria-label="J'aime"
      >
        👍
      </button>
      <button
        type="button"
        onClick={() => onVote(vote === -1 ? 0 : -1)}
        className={`transition-opacity ${vote === -1 ? "opacity-100" : "opacity-30 hover:opacity-70"}`}
        title="Pas intéressé — masque l'item et pénalise la source"
        aria-label="Pas intéressé"
      >
        👎
      </button>
    </div>
  );
}

// Vote + ignore + seen controls for one FeedItem - shared by the widget
// (/rss/widget) and the tuning preview (/recommend). Each handler hits the
// matching /rss/feed/{id}/{vote,ignore,seen} endpoint.
export default function ItemActions({
  item,
  actions,
}: {
  item: { id: string; vote: number; seen: boolean; ignored: boolean };
  actions: ItemActionHandlers;
}) {
  return (
    <div className="flex shrink-0 items-start gap-1.5">
      <VoteButtons vote={item.vote} onVote={(v) => actions.onVote(item.id, v)} />
      <button
        type="button"
        onClick={() => actions.onToggleIgnored(item.id, !item.ignored)}
        className={`mt-0.5 text-sm leading-none transition-opacity ${item.ignored ? "opacity-100" : "opacity-30 hover:opacity-70"}`}
        title={
          item.ignored
            ? "Ne plus ignorer"
            : "Ignorer — passer sans regarder (sort des recommandations)"
        }
        aria-label={item.ignored ? "Ne plus ignorer" : "Ignorer"}
        aria-pressed={item.ignored}
      >
        ⏭
      </button>
      <input
        type="checkbox"
        checked={item.seen}
        onChange={(e) => actions.onToggleSeen(item.id, e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-teal-500"
        aria-label={item.seen ? "Marquer comme non vu" : "Marquer comme vu"}
      />
    </div>
  );
}
