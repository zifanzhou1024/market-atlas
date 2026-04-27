import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type MarketDataDb = DatabaseSync;

export const SQLITE_BUSY_TIMEOUT_MS = 5000;
export const DEFAULT_MARKET_DATA_DB_PATH = join(process.cwd(), "data", "market-atlas.sqlite");

export function createMarketDataDb(dbPath = DEFAULT_MARKET_DATA_DB_PATH): MarketDataDb {
  mkdirSync(dirname(dbPath), { recursive: true });
  return new DatabaseSync(dbPath, { timeout: SQLITE_BUSY_TIMEOUT_MS });
}

export function initializeMarketDataSchema(db: MarketDataDb) {
  db.exec(`
    create table if not exists data_sources (
      source_key text primary key,
      display_name text not null,
      source_url text not null,
      provider text not null,
      enabled integer not null default 1,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists refresh_runs (
      id integer primary key autoincrement,
      source_key text not null,
      started_at text not null,
      finished_at text not null,
      status text not null,
      rows_fetched integer not null default 0,
      rows_changed integer not null default 0,
      error_message text,
      foreign key (source_key) references data_sources(source_key)
    );

    create table if not exists spx_daily_prices (
      date text primary key,
      open real not null,
      high real not null,
      low real not null,
      close real not null,
      volume real,
      source_key text not null,
      fetched_at text not null,
      foreign key (source_key) references data_sources(source_key)
    );
  `);
}
