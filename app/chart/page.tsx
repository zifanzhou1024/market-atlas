import { loadShillerPageDataset } from "../../lib/pages-data";
import { withBasePath } from "../../lib/paths";
import { DetailedChart } from "./detailed-chart";

export default async function ChartPage() {
  try {
    const dataset = await loadShillerPageDataset();

    return (
      <DetailedChart
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
            <a href={withBasePath("/")}>Dashboard</a>
            <a href={withBasePath("/chart")} aria-current="page">Detailed chart</a>
            <a href={withBasePath("/buffett")}>Buffett indicator</a>
            <a href={withBasePath("/spx-weekdays")}>SPX weekdays</a>
            <a href={withBasePath("/data")}>Data status</a>
          </nav>
        </header>
        <section className="errorState" aria-labelledby="chart-error-title">
          <p className="eyebrow">Live data unavailable</p>
          <h1 id="chart-error-title">The detailed chart could not be loaded.</h1>
          <p>
            {error instanceof Error
              ? error.message
              : "The public market data sources did not respond."}
          </p>
          <a href={withBasePath("/data")}>View data status</a>
        </section>
      </main>
    );
  }
}
