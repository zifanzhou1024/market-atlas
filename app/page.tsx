import { Dashboard } from "./dashboard";
import { loadShillerPageDataset } from "../lib/pages-data";
import { withBasePath } from "../lib/paths";

export default async function Home() {
  try {
    const dataset = await loadShillerPageDataset();

    return (
      <Dashboard
        initialPoints={dataset.points}
        sourceUrl={dataset.sourceUrl}
        dailySourceUrl={dataset.dailySourceUrl}
        ohlcSourceUrl={dataset.ohlcSourceUrl}
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
            <a href="#dashboard" aria-current="page">Dashboard</a>
            <a href={withBasePath("/chart")}>Detailed chart</a>
            <a href={withBasePath("/buffett")}>Buffett indicator</a>
            <a href={withBasePath("/spx-weekdays")}>SPX weekdays</a>
            <a href="#notes">Notes</a>
            <a href={withBasePath("/data")}>Data status</a>
          </nav>
        </header>
        <section className="errorState" aria-labelledby="data-error-title">
          <p className="eyebrow">Live data unavailable</p>
          <h1 id="data-error-title">Shiller PE could not be loaded.</h1>
          <p>
            {error instanceof Error
              ? error.message
              : "The public workbook did not respond."}
          </p>
          <a href={withBasePath("/data")}>View data status</a>
        </section>
      </main>
    );
  }
}
