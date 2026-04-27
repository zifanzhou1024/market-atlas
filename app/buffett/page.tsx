import { fetchBuffettData } from "../../lib/buffett";
import { BuffettDashboard } from "./buffett-dashboard";

export const revalidate = 21600;

export default async function BuffettPage() {
  try {
    const dataset = await fetchBuffettData();

    return (
      <BuffettDashboard
        initialPoints={dataset.points}
        worldPoints={dataset.worldPoints}
        globalPoints={dataset.globalPoints}
        marketValueSourceUrl={dataset.marketValueSourceUrl}
        gdpSourceUrl={dataset.gdpSourceUrl}
        worldGdpSourceUrl={dataset.worldGdpSourceUrl}
        worldMarketValueSourceUrl={dataset.worldMarketValueSourceUrl}
        fetchedAt={dataset.fetchedAt}
      />
    );
  } catch (error) {
    return (
      <main className="shell">
        <header className="topbar">
          <a className="brand" href="/">
            <span className="brandMark" aria-hidden="true" />
            Market Atlas
          </a>
          <nav aria-label="Primary navigation">
            <a href="/">Dashboard</a>
            <a href="/chart">CAPE chart</a>
            <a href="/buffett">Buffett indicator</a>
            <a href="/spx-weekdays">SPX weekdays</a>
          </nav>
        </header>
        <section className="errorState" aria-labelledby="buffett-error-title">
          <p className="eyebrow">Live data unavailable</p>
          <h1 id="buffett-error-title">The Buffett indicator could not be loaded.</h1>
          <p>
            {error instanceof Error
              ? error.message
              : "The public FRED data sources did not respond."}
          </p>
          <a href="/api/buffett">Check the data endpoint</a>
        </section>
      </main>
    );
  }
}
