import TrackerSection from "@/components/TrackerSection";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Hermes</h1>
        <p className="text-sm text-neutral-400">
          Recherche et ajoute ce que tu veux suivre. Les flux RSS sont générés
          automatiquement : <code>/rss/youtube.xml</code>,{" "}
          <code>/rss/anime.xml</code>, <code>/rss/games.xml</code>, ou{" "}
          <code>/rss/all.xml</code> pour tout regrouper.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        <TrackerSection category="youtube" title="Chaînes YouTube" />
        <TrackerSection category="anime" title="Animes" />
        <TrackerSection category="games" title="Jeux vidéo" />
      </div>
    </main>
  );
}
