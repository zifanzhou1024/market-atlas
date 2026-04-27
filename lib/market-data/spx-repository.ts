import type { SpxDailyPrice } from "../spx-source";
import type { MarketDataDb } from "./db";

export type SpxCacheSummary = {
  rowCount: number;
  firstDate: string | null;
  latestDate: string | null;
};

export function upsertSpxDailyPrices(
  db: MarketDataDb,
  rows: SpxDailyPrice[],
  sourceKey: string
): number {
  const fetchedAt = new Date().toISOString();
  const statement = db.prepare(`
    insert into spx_daily_prices (date, open, high, low, close, volume, source_key, fetched_at)
    values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(date) do update set
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume,
      source_key = excluded.source_key,
      fetched_at = excluded.fetched_at
  `);

  db.exec("begin");
  try {
    for (const row of rows) {
      statement.run(
        row.date,
        row.open,
        row.high,
        row.low,
        row.close,
        row.volume,
        sourceKey,
        fetchedAt
      );
    }
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }

  return rows.length;
}

export function readSpxDailyPrices(db: MarketDataDb): SpxDailyPrice[] {
  return db.prepare(`
    select date, open, high, low, close, volume
    from spx_daily_prices
    order by date asc
  `).all() as SpxDailyPrice[];
}

export function getSpxCacheSummary(db: MarketDataDb): SpxCacheSummary {
  return db.prepare(`
    select
      count(*) as rowCount,
      min(date) as firstDate,
      max(date) as latestDate
    from spx_daily_prices
  `).get() as SpxCacheSummary;
}
