import { loadBuffettPageDataset } from "../../lib/pages-data";
import { withBasePath } from "../../lib/paths";
import { BuffettDashboard } from "./buffett-dashboard";

export default async function BuffettPage() {
  try {
    const dataset = await loadBuffettPageDataset();

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
          <a className="brand" href={withBasePath("/")}>
            <span className="brandMark" aria-hidden="true" />
            Market Atlas
          </a>
          <nav aria-label="Primary navigation">
            <a href={withBasePath("/")}>Dashboard</a>
            <a href={withBasePath("/chart")}>CAPE chart</a>
            <a href={withBasePath("/buffett")} aria-current="page">Buffett indicator</a>
            <a href={withBasePath("/spx-weekdays")}>SPX weekdays</a>
            <a href={withBasePath("/data")}>Data status</a>
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
          <a href={withBasePath("/data")}>View data status</a>
        </section>
      </main>
    );
  }
}
