import type { MarketDataDb } from "./db";

export type DataSourceInput = {
  key: string;
  displayName: string;
  sourceUrl: string;
  provider: string;
};

export type RefreshRunInput = {
  sourceKey: string;
  status: "success" | "failure";
  rowsFetched: number;
  rowsChanged: number;
  errorMessage: string | null;
};

export function upsertDataSource(db: MarketDataDb, source: DataSourceInput) {
  const now = new Date().toISOString();

  db.prepare(`
    insert into data_sources (source_key, display_name, source_url, provider, enabled, created_at, updated_at)
    values (?, ?, ?, ?, 1, ?, ?)
    on conflict(source_key) do update set
      display_name = excluded.display_name,
      source_url = excluded.source_url,
      provider = excluded.provider,
      enabled = 1,
      updated_at = excluded.updated_at
  `).run(source.key, source.displayName, source.sourceUrl, source.provider, now, now);
}

export function recordRefreshRun(db: MarketDataDb, run: RefreshRunInput) {
  const now = new Date().toISOString();

  db.prepare(`
    insert into refresh_runs
      (source_key, started_at, finished_at, status, rows_fetched, rows_changed, error_message)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.sourceKey,
    now,
    now,
    run.status,
    run.rowsFetched,
    run.rowsChanged,
    run.errorMessage
  );
}
