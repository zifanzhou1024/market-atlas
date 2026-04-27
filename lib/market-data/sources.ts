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

export type RefreshRunSummary = {
  lastSuccessfulRefreshAt: string | null;
  lastAttemptedRefreshAt: string | null;
  lastAttemptStatus: "success" | "failure" | null;
  lastAttemptErrorMessage: string | null;
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

export function recordRefreshRun(db: MarketDataDb, run: RefreshRunInput, now = new Date()) {
  const timestamp = now.toISOString();

  db.prepare(`
    insert into refresh_runs
      (source_key, started_at, finished_at, status, rows_fetched, rows_changed, error_message)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.sourceKey,
    timestamp,
    timestamp,
    run.status,
    run.rowsFetched,
    run.rowsChanged,
    run.errorMessage
  );
}

export function getRefreshRunSummary(db: MarketDataDb, sourceKey: string): RefreshRunSummary {
  const timestamps = db.prepare(`
    select
      max(case when status = 'success' then finished_at end) as lastSuccessfulRefreshAt,
      max(finished_at) as lastAttemptedRefreshAt
    from refresh_runs
    where source_key = ?
  `).get(sourceKey) as RefreshRunSummary;
  const latest = db.prepare(`
    select status as lastAttemptStatus, error_message as lastAttemptErrorMessage
    from refresh_runs
    where source_key = ?
    order by finished_at desc, id desc
    limit 1
  `).get(sourceKey) as
    | {
        lastAttemptStatus: "success" | "failure";
        lastAttemptErrorMessage: string | null;
      }
    | undefined;

  return {
    ...timestamps,
    lastAttemptStatus: latest?.lastAttemptStatus ?? null,
    lastAttemptErrorMessage: latest?.lastAttemptErrorMessage ?? null
  };
}
