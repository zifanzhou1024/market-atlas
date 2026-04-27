export type SpxDailyPrice = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export const STOOQ_SPX_DAILY_URL = "https://stooq.com/q/d/l/?s=%5Espx&i=d";
export const SPX_START_DATE = "1993-01-01";

export async function fetchStooqSpxDailyCsv(): Promise<string> {
  const response = await fetch(STOOQ_SPX_DAILY_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Stooq SPX source returned ${response.status}`);
  }

  return response.text();
}

export function parseStooqDailyCsv(csv: string): SpxDailyPrice[] {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);

  if (!headerLine) {
    return [];
  }

  const headers = headerLine.split(",").map((header) => header.trim().toLowerCase());
  const dateIndex = headers.indexOf("date");
  const openIndex = headers.indexOf("open");
  const highIndex = headers.indexOf("high");
  const lowIndex = headers.indexOf("low");
  const closeIndex = headers.indexOf("close");
  const volumeIndex = headers.indexOf("volume");

  if ([dateIndex, openIndex, highIndex, lowIndex, closeIndex].some((index) => index === -1)) {
    return [];
  }

  return lines
    .map((line) => {
      const cells = line.split(",").map((cell) => cell.trim());
      const date = cells[dateIndex];
      const open = toFiniteNumber(cells[openIndex]);
      const high = toFiniteNumber(cells[highIndex]);
      const low = toFiniteNumber(cells[lowIndex]);
      const close = toFiniteNumber(cells[closeIndex]);
      const volume = volumeIndex === -1 ? null : toOptionalFiniteNumber(cells[volumeIndex]);

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date < SPX_START_DATE ||
        open === null ||
        high === null ||
        low === null ||
        close === null
      ) {
        return null;
      }

      return { date, open, high, low, close, volume };
    })
    .filter((row): row is SpxDailyPrice => row !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function toFiniteNumber(value: string | undefined): number | null {
  if (!value || value.toUpperCase() === "N/D") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalFiniteNumber(value: string | undefined): number | null {
  if (!value || value.toUpperCase() === "N/D") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
