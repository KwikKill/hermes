import Link from "next/link";
import TrackerSection from "@/components/TrackerSection";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="text-2xl font-bold">Hermes</h1>
          <Link href="/recommend" className="text-sm underline">
            Réglage des recommandations
          </Link>
        </div>
        <p className="text-sm text-neutral-400">
          Recherche et ajoute ce que tu veux suivre. Les flux RSS sont générés
          automatiquement : <code>/rss/youtube.xml</code>,{" "}
          <code>/rss/anime.xml</code>, <code>/rss/games.xml</code>, ou{" "}
          <code>/rss/all.xml</code> pour tout regrouper.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <TrackerSection category="youtube" title="Chaînes YouTube" />
        <TrackerSection category="anime" title="Animes" />
        <TrackerSection category="games" title="Jeux vidéo" />
      </div>
    </main>
  );
}
