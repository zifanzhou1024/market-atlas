import * as XLSX from "xlsx";

export type ShillerPoint = {
  date: string;
  cape: number;
  price: number | null;
  priceOhlc?: Ohlc | null;
  earnings: number | null;
  longRate: number | null;
  cpi?: number | null;
  realPrice?: number | null;
  realEarnings?: number | null;
  avgRealEarnings?: number | null;
  capeOhlc?: Ohlc | null;
  sourceCape?: number | null;
  frequency?: "monthly" | "daily";
  source?: string;
};

export type Ohlc = {
  open: number;
  high: number;
  low: number;
  close: number;
};

export type FredObservation = {
  date: string;
  value: number;
};

export type NasdaqOhlcObservation = Ohlc & {
  date: string;
};

export type ShillerDataset = {
  points: ShillerPoint[];
  sourceUrl: string;
  dailySourceUrl: string | null;
  ohlcSourceUrl: string | null;
  fetchedAt: string;
};

const SHILLER_SOURCE_URLS = [
  "https://img1.wsimg.com/blobby/go/e5e77e0b-59d1-44d9-ab25-4763ac982e53/downloads/7fd201b2-28ad-476c-bc67-7a2cab5304a3/ie_data.xls?ver=1775144929611",
  "http://www.econ.yale.edu/~shiller/data/ie_data.xls"
] as const;

const FRED_SP500_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500";
const NASDAQ_SPY_SOURCE_URL = "https://api.nasdaq.com/api/quote/SPY/historical?assetclass=etf";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

let cachedDataset: { expiresAt: number; data: ShillerDataset } | undefined;

export async function fetchShillerData(): Promise<ShillerDataset> {
  if (cachedDataset && cachedDataset.expiresAt > Date.now()) {
    return cachedDataset.data;
  }

  let lastError: unknown;

  for (const sourceUrl of SHILLER_SOURCE_URLS) {
    try {
      const response = await fetch(sourceUrl, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Shiller source returned ${response.status}`);
      }

      const workbookBuffer = await response.arrayBuffer();
      const monthlyPoints = parseShillerWorkbook(workbookBuffer);

      if (monthlyPoints.length === 0) {
        throw new Error("Shiller workbook did not contain enough component rows");
      }

      const dailyPrices = await fetchFredDailyPrices().catch(() => []);
      const spyOhlc =
        dailyPrices.length > 0
          ? await fetchSpyDailyOhlc(
              addYears(dailyPrices[dailyPrices.length - 1].date, -5),
              dailyPrices[dailyPrices.length - 1].date
            ).catch(() => [])
          : [];
      const dailyPoints = buildDailyCapePoints(monthlyPoints, dailyPrices, 5, spyOhlc);
      const dailyCutoff = dailyPoints[0]?.date;
      const points = dailyCutoff
        ? [
            ...monthlyPoints.filter((point) => point.date < dailyCutoff),
            ...dailyPoints
          ]
        : monthlyPoints;

      const data = {
        points,
        sourceUrl,
        dailySourceUrl: dailyPoints.length > 0 ? FRED_SP500_URL : null,
        ohlcSourceUrl: dailyPoints.some((point) => point.capeOhlc) ? NASDAQ_SPY_SOURCE_URL : null,
        fetchedAt: new Date().toISOString()
      };

      cachedDataset = {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data
      };

      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to fetch Shiller data");
}

export function parseShillerWorkbook(workbookBuffer: ArrayBuffer | Uint8Array): ShillerPoint[] {
  const workbook = XLSX.read(workbookBuffer, { type: "array" });
  const sheetNames = [
    ...workbook.SheetNames.filter((sheetName) => sheetName.toLowerCase() === "data"),
    ...workbook.SheetNames.filter((sheetName) => sheetName.toLowerCase() !== "data")
  ];

  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const points = parseWorksheet(worksheet);

    if (points.length > 0) {
      return points;
    }
  }

  return [];
}

function parseWorksheet(worksheet: XLSX.WorkSheet): ShillerPoint[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    blankrows: false
  });

  const headerRowIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);

    return (
      headers[0] === "date" &&
      headers.includes("p") &&
      headers.includes("e") &&
      headers.includes("cape")
    );
  });

  if (headerRowIndex === -1) {
    return [];
  }

  const headers = rows[headerRowIndex].map(normalizeHeader);
  const columnMap = {
    date: headers.findIndex((header) => header === "date"),
    sourceCape: headers.findIndex((header) => header === "cape"),
    price: findColumn(headers, ["p"]),
    earnings: findColumn(headers, ["e"]),
    cpi: findColumn(headers, ["cpi"]),
    longRate: findColumn(headers, ["rate gs10", "long interest rate", "long rate"])
  };

  if (columnMap.date === -1 || columnMap.price === -1 || columnMap.earnings === -1 || columnMap.cpi === -1) {
    return [];
  }

  const components = rows
    .slice(headerRowIndex + 1)
    .map((row) => rowToComponent(row, columnMap))
    .filter((component): component is MonthlyComponent => component !== null)
    .sort((left, right) => left.date.localeCompare(right.date));

  return buildMonthlyCapePoints(components);
}

type MonthlyComponent = {
  date: string;
  price: number;
  earnings: number | null;
  cpi: number;
  longRate: number | null;
  sourceCape: number | null;
};

function rowToComponent(
  row: unknown[],
  columnMap: {
    date: number;
    price: number;
    earnings: number;
    cpi: number;
    longRate: number;
    sourceCape: number;
  }
): MonthlyComponent | null {
  const date = parseShillerDate(row[columnMap.date]);
  const price = toNumber(row[columnMap.price]);
  const cpi = toNumber(row[columnMap.cpi]);

  if (!date || price === null || cpi === null) {
    return null;
  }

  return {
    date,
    price,
    earnings: toOptionalNumber(row[columnMap.earnings]),
    cpi,
    sourceCape: toOptionalNumber(row[columnMap.sourceCape]),
    longRate: toOptionalNumber(row[columnMap.longRate])
  };
}

function buildMonthlyCapePoints(components: MonthlyComponent[]): ShillerPoint[] {
  const baseCpi = components[components.length - 1]?.cpi;

  if (!baseCpi) {
    return [];
  }

  return components.reduce<ShillerPoint[]>((points, component, index) => {
      const trailingEarnings = components
        .slice(0, index)
        .filter((point) => point.earnings !== null && point.cpi > 0)
        .slice(-120);

      if (trailingEarnings.length < 120) {
        return points;
      }

      const avgRealEarnings = average(
        trailingEarnings.map((point) => (point.earnings as number) * (baseCpi / point.cpi))
      );
      const realPrice = component.price * (baseCpi / component.cpi);
      const realEarnings =
        component.earnings === null ? null : component.earnings * (baseCpi / component.cpi);

      points.push({
        date: component.date,
        cape: roundNumber(realPrice / avgRealEarnings),
        price: component.price,
        earnings: component.earnings,
        cpi: component.cpi,
        realPrice: roundNumber(realPrice),
        realEarnings: realEarnings === null ? null : roundNumber(realEarnings),
        avgRealEarnings: roundNumber(avgRealEarnings),
        sourceCape: component.sourceCape,
        longRate: component.longRate,
        frequency: "monthly" as const,
        source: "Computed monthly from Shiller price, earnings, and CPI"
      });

      return points;
    }, []);
}

export function parseFredCsv(csv: string): FredObservation[] {
  const rows = csv.trim().split(/\r?\n/);

  return rows
    .slice(1)
    .map((row) => {
      const [date, rawValue] = row.split(",");
      const value = toNumber(rawValue);

      if (!date || value === null) {
        return null;
      }

      return { date, value };
    })
    .filter((row): row is FredObservation => row !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function parseNasdaqHistoricalJson(input: unknown): NasdaqOhlcObservation[] {
  const payload = typeof input === "string" ? JSON.parse(input) : input;
  const rows = getNasdaqRows(payload);

  return rows
    .map((row) => {
      const date = parseUsDate(row.date);
      const open = toMarketNumber(row.open);
      const high = toMarketNumber(row.high);
      const low = toMarketNumber(row.low);
      const close = toMarketNumber(row.close);

      if (!date || open === null || high === null || low === null || close === null || close <= 0) {
        return null;
      }

      return { date, open, high, low, close };
    })
    .filter((row): row is NasdaqOhlcObservation => row !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function buildDailyCapePoints(
  monthlyPoints: ShillerPoint[],
  dailyPrices: FredObservation[],
  years = 5,
  dailyOhlc: NasdaqOhlcObservation[] = []
): ShillerPoint[] {
  if (monthlyPoints.length === 0 || dailyPrices.length === 0) {
    return [];
  }

  const baseCpi = [...monthlyPoints].reverse().find((point) => point.cpi)?.cpi;
  const latestDailyDate = dailyPrices[dailyPrices.length - 1].date;
  const cutoff = addYears(latestDailyDate, -years);
  const ohlcByDate = new Map(dailyOhlc.map((ohlc) => [ohlc.date, ohlc]));

  if (!baseCpi) {
    return [];
  }

  return dailyPrices.reduce<ShillerPoint[]>((points, dailyPrice) => {
      if (dailyPrice.date < cutoff) {
        return points;
      }

      const monthlyPoint = findPointAtOrBefore(monthlyPoints, dailyPrice.date);

      if (!monthlyPoint?.avgRealEarnings || !monthlyPoint.cpi) {
        return points;
      }

      const realPrice = dailyPrice.value * (baseCpi / monthlyPoint.cpi);
      const priceOhlc = scaleOhlcToClose(ohlcByDate.get(dailyPrice.date), dailyPrice.value);
      const capeOhlc = priceOhlc
        ? {
            open: roundNumber((priceOhlc.open * (baseCpi / monthlyPoint.cpi)) / monthlyPoint.avgRealEarnings),
            high: roundNumber((priceOhlc.high * (baseCpi / monthlyPoint.cpi)) / monthlyPoint.avgRealEarnings),
            low: roundNumber((priceOhlc.low * (baseCpi / monthlyPoint.cpi)) / monthlyPoint.avgRealEarnings),
            close: roundNumber(realPrice / monthlyPoint.avgRealEarnings)
          }
        : null;

      points.push({
        date: dailyPrice.date,
        cape: roundNumber(realPrice / monthlyPoint.avgRealEarnings),
        price: dailyPrice.value,
        priceOhlc,
        earnings: monthlyPoint.earnings,
        cpi: monthlyPoint.cpi,
        realPrice: roundNumber(realPrice),
        realEarnings: monthlyPoint.realEarnings ?? null,
        avgRealEarnings: monthlyPoint.avgRealEarnings,
        capeOhlc,
        sourceCape: null,
        longRate: monthlyPoint.longRate,
        frequency: "daily" as const,
        source: capeOhlc
          ? "Computed daily from FRED S&P 500 close, Nasdaq SPY OHLC proxy, and monthly real earnings"
          : "Computed daily from FRED S&P 500 price and monthly real earnings"
      });

      return points;
    }, []);
}

async function fetchFredDailyPrices(): Promise<FredObservation[]> {
  const response = await fetch(FRED_SP500_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`FRED S&P 500 source returned ${response.status}`);
  }

  return parseFredCsv(await response.text());
}

async function fetchSpyDailyOhlc(fromDate: string, toDate: string): Promise<NasdaqOhlcObservation[]> {
  const response = await fetch(buildNasdaqHistoricalUrl(fromDate, toDate), {
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json,text/plain,*/*"
    }
  });

  if (!response.ok) {
    throw new Error(`Nasdaq SPY OHLC source returned ${response.status}`);
  }

  return parseNasdaqHistoricalJson(await response.text());
}

function buildNasdaqHistoricalUrl(fromDate: string, toDate: string): string {
  const url = new URL(NASDAQ_SPY_SOURCE_URL);
  url.searchParams.set("fromdate", fromDate);
  url.searchParams.set("todate", toDate);
  url.searchParams.set("limit", "2000");
  return url.toString();
}

function parseShillerDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const year = Math.trunc(value);
    const monthDecimal = value - year;
    const month = Math.max(1, Math.min(12, Math.round(monthDecimal * 100)));
    return `${year}-${String(month).padStart(2, "0")}-01`;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    const match = normalized.match(/^(\d{4})(?:[.-](\d{1,2}))?$/);

    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2] ?? 1);

      if (Number.isFinite(year) && month >= 1 && month <= 12) {
        return `${year}-${String(month).padStart(2, "0")}-01`;
      }
    }
  }

  return null;
}

function findColumn(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const exactMatch = headers.findIndex((header) => header === candidate);

    if (exactMatch !== -1) {
      return exactMatch;
    }
  }

  return -1;
}

function toOptionalNumber(value: unknown): number | null {
  return toNumber(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return roundNumber(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed === "") {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? roundNumber(parsed) : null;
  }

  return null;
}

function toMarketNumber(value: unknown): number | null {
  if (typeof value === "string") {
    return toNumber(value.replace(/[$,%]/g, "").replace(/,/g, ""));
  }

  return toNumber(value);
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function scaleOhlcToClose(ohlc: NasdaqOhlcObservation | undefined, targetClose: number): Ohlc | null {
  if (!ohlc || ohlc.close <= 0) {
    return null;
  }

  const scale = targetClose / ohlc.close;

  return {
    open: roundNumber(ohlc.open * scale),
    high: roundNumber(ohlc.high * scale),
    low: roundNumber(ohlc.low * scale),
    close: roundNumber(targetClose)
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function findPointAtOrBefore(points: ShillerPoint[], date: string): ShillerPoint | undefined {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].date <= date) {
      return points[index];
    }
  }

  return undefined;
}

function addYears(date: string, years: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next.toISOString().slice(0, 10);
}

function parseUsDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);

  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getNasdaqRows(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const data = "data" in payload ? payload.data : undefined;

  if (!data || typeof data !== "object" || !("tradesTable" in data)) {
    return [];
  }

  const tradesTable = data.tradesTable;

  if (!tradesTable || typeof tradesTable !== "object" || !("rows" in tradesTable)) {
    return [];
  }

  const rows = tradesTable.rows;

  return Array.isArray(rows)
    ? rows.filter((row): row is Record<string, unknown> => row !== null && typeof row === "object")
    : [];
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
