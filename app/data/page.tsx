import { formatDateTime, formatDay } from "../../lib/format";
import { loadDataManifest } from "../../lib/pages-data";
import { withBasePath } from "../../lib/paths";
import {
  ManifestSchema,
  type SourceStatus
} from "../../lib/schemas/manifest";

export const metadata = {
  title: "Data status | Market Atlas",
  description: "Freshness, provenance, and downloads for Market Atlas datasets."
};

const sourceOrder = ["shiller", "buffett", "spxWeekdays"] as const;
const ranges = ["1m", "3m", "6m", "ytd", "1y", "2y", "5y", "10y", "all"];
const methods = ["openClose", "closeClose"];

export default async function DataPage() {
  const manifest = ManifestSchema.parse(await loadDataManifest());

  return (
    <main className="shell chartShell">
      <header className="topbar">
        <a className="brand" href={withBasePath("/")}>
          <span className="brandMark" aria-hidden="true" />
          Market Atlas
        </a>
        <nav aria-label="Primary navigation">
          <a href={withBasePath("/")}>Dashboard</a>
          <a href={withBasePath("/chart")}>Detailed chart</a>
          <a href={withBasePath("/buffett")}>Buffett indicator</a>
          <a href={withBasePath("/spx-weekdays")}>SPX weekdays</a>
          <a href={withBasePath("/data")} aria-current="page">Data status</a>
        </nav>
      </header>

      <section className="workbenchIntro dataIntro">
        <div>
          <p className="eyebrow">Static dashboard</p>
          <h1>Data sources &amp; freshness</h1>
          <p>
            Every chart is built from validated JSON committed with the site.
            This page shows what was fetched, what was preserved, and where the
            underlying data came from.
          </p>
        </div>
        <div className="quoteStack">
          <span>Validation tier</span>
          <strong>{manifest.validationTier}</strong>
          <em>Schema + sanity bounds</em>
        </div>
      </section>

      <section className="panel buildMetadataStrip" aria-label="Build metadata">
        <div>
          <span>Manifest generated</span>
          <strong>{formatDateTime(manifest.generatedAt)}</strong>
        </div>
        <div>
          <span>Repository ref</span>
          <strong>{manifest.generatedBy.ref}</strong>
        </div>
        <div>
          <span>Workflow</span>
          {manifest.generatedBy.runUrl ? (
            <a href={manifest.generatedBy.runUrl}>
              Run {manifest.generatedBy.runId}
            </a>
          ) : (
            <strong>Local generation</strong>
          )}
        </div>
      </section>

      <section className="sourceCardGrid" aria-label="Dataset status">
        {sourceOrder.map((key) => (
          <SourceCard key={key} sourceKey={key} source={manifest.sources[key]} />
        ))}
      </section>

      <section className="sourceNote panel">
        <p className="eyebrow">Preserve-on-failure policy</p>
        <p>
          Fresh downloads must pass L3 validation before replacing committed
          data. If a source or validation step fails, Market Atlas keeps the
          previous valid snapshot and labels that source stale. Deployment only
          stops when every source fails and no fallback exists.
        </p>
      </section>
    </main>
  );
}

function SourceCard({
  sourceKey,
  source
}: {
  sourceKey: (typeof sourceOrder)[number];
  source: SourceStatus;
}) {
  const tone = source.status === "ok" ? "green" : source.status === "stale" ? "amber" : "red";
  const downloads = getDownloads(sourceKey);

  return (
    <article className="panel sourceCard">
      <header>
        <div>
          <p className="eyebrow">{sourceKey === "spxWeekdays" ? "SPX research" : "Valuation data"}</p>
          <h2>{source.displayName}</h2>
        </div>
        <span
          className={`statusBadge ${tone}`}
          aria-label={`Status: ${source.status}`}
        >
          {source.status}
        </span>
      </header>

      <dl>
        <div>
          <dt>Last successful fetch</dt>
          <dd>{source.lastSuccessfulFetchAt ? formatDateTime(source.lastSuccessfulFetchAt) : "Not recorded"}</dd>
        </div>
        {source.status !== "ok" ? (
          <div>
            <dt>Last attempted fetch</dt>
            <dd>{formatDateTime(source.lastAttemptedFetchAt)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Latest data row</dt>
          <dd>
            {source.latestDate ? formatDay(source.latestDate) : "Unavailable"}
            {" · "}
            {new Intl.NumberFormat("en").format(source.rowCount)} rows
          </dd>
        </div>
        <div>
          <dt>Primary source</dt>
          <dd>
            <a
              className="sourceUrl"
              href={source.sourceUrls[0]}
              title={source.sourceUrls[0]}
            >
              {hostname(source.sourceUrls[0])}
            </a>
          </dd>
        </div>
      </dl>

      {source.sourceUrls.length > 1 ? (
        <p className="additionalSources">
          Also:{" "}
          {source.sourceUrls.slice(1).map((url, index) => (
            <span key={url}>
              {index > 0 ? ", " : ""}
              <a href={url}>{hostname(url)}</a>
            </span>
          ))}
        </p>
      ) : null}

      {sourceKey === "spxWeekdays" ? (
        <details className="downloadDetails">
          <summary>Download 18 weekday datasets</summary>
          <DownloadLinks downloads={downloads} />
        </details>
      ) : (
        <DownloadLinks downloads={downloads} />
      )}

      {source.errorMessage ? (
        <p className="sourceError" role="status">{source.errorMessage}</p>
      ) : null}
    </article>
  );
}

function DownloadLinks({
  downloads
}: {
  downloads: Array<{ label: string; path: string }>;
}) {
  return (
    <div className="downloadLinks">
      {downloads.map((download) => (
        <a key={download.path} href={withBasePath(download.path)} download>
          {download.label}
        </a>
      ))}
    </div>
  );
}

function getDownloads(sourceKey: (typeof sourceOrder)[number]) {
  if (sourceKey === "shiller") {
    return [{ label: "shiller.json", path: "/data/shiller.json" }];
  }
  if (sourceKey === "buffett") {
    return [{ label: "buffett.json", path: "/data/buffett.json" }];
  }
  return ranges.flatMap((range) =>
    methods.map((method) => ({
      label: `${range}-${method}.json`,
      path: `/data/spx-weekdays/${range}-${method}.json`
    }))
  );
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
