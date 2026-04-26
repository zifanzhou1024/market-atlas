import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildDailyCapePoints,
  parseFredCsv,
  parseNasdaqHistoricalJson,
  parseShillerWorkbook
} from "../lib/shiller";

function buildWorkbook(): ArrayBuffer {
  const rows: unknown[][] = [
    ["Some Shiller workbook title"],
    [],
    [
      "Date",
      "P",
      "D",
      "E",
      "CPI",
      "Fraction",
      "Rate GS10",
      "Price",
      "Dividend",
      "Price",
      "Earnings",
      "Earnings",
      "CAPE"
    ],
    ...buildStableRows(2014, 1, 120, 100, 10, 100),
    [2024.01, 220, 2, 10, 100, 2024.01, 4.06, 220, 2, 220, 10, 10, 999],
    [2024.02, 240, 2, 10, 100, 2024.02, 4.21, 240, 2, 240, 10, 10, ""],
    ["Notes follow below the data table"]
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Data");
  return XLSX.write(workbook, { bookType: "xls", type: "array" });
}

function buildMultiSheetWorkbook(): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["Disclaimer before the data"]]),
    "Disclaimer"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [null, null, null, null, null, "Date  ", "Interest", null, null, null, null, null, "P/E10 or", null, null, null, "CAPE"],
      ["Date", "P", "D", "E", "CPI", "Fraction", "Rate GS10", "Price", "Dividend", "Real Price", "Real Dividend", "Real Earnings", "CAPE"],
      ...buildStableRows(1871, 1, 120, 100, 10, 100),
      [1881.01, 200, 0.27, 10, 100, 1881.04, 3.7, 200, 6.55, 200, 6.55, 10, 999]
    ]),
    "Data"
  );

  return XLSX.write(workbook, { bookType: "xls", type: "array" });
}

describe("parseShillerWorkbook", () => {
  it("computes CAPE from price, earnings, and CPI instead of trusting the CAPE column", () => {
    const result = parseShillerWorkbook(buildWorkbook());
    const latest = result.at(-1);

    expect(latest).toMatchObject({
      date: "2024-02-01",
      cape: 24,
      price: 240,
      earnings: 10,
      avgRealEarnings: 10,
      sourceCape: null,
      frequency: "monthly"
    });
    expect(result.find((point) => point.date === "2024-01-01")?.sourceCape).toBe(999);
    expect(result.find((point) => point.date === "2024-01-01")?.cape).toBe(22);
  });

  it("finds the data table when the workbook starts with non-data sheets", () => {
    const result = parseShillerWorkbook(buildMultiSheetWorkbook());

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: "1881-01-01",
      cape: 20,
      longRate: 3.7
    });
  });
});

describe("parseFredCsv", () => {
  it("parses daily FRED CSV rows and skips missing observations", () => {
    const rows = parseFredCsv("observation_date,SP500\n2026-04-22,7137.90\n2026-04-23,\n2026-04-24,7165.08\n");

    expect(rows).toEqual([
      { date: "2026-04-22", value: 7137.9 },
      { date: "2026-04-24", value: 7165.08 }
    ]);
  });
});

describe("buildDailyCapePoints", () => {
  it("uses daily S&P 500 prices with the latest monthly real earnings denominator", () => {
    const monthly = parseShillerWorkbook(buildWorkbook());
    const daily = buildDailyCapePoints(monthly, [
      { date: "2024-02-02", value: 260 },
      { date: "2024-02-05", value: 280 }
    ]);

    expect(daily).toEqual([
      expect.objectContaining({
        date: "2024-02-02",
        cape: 26,
        price: 260,
        avgRealEarnings: 10,
        frequency: "daily"
      }),
      expect.objectContaining({
        date: "2024-02-05",
        cape: 28,
        price: 280,
        avgRealEarnings: 10,
        frequency: "daily"
      })
    ]);
  });

  it("adds CAPE candles by scaling SPY OHLC to the authoritative S&P close", () => {
    const monthly = parseShillerWorkbook(buildWorkbook());
    const daily = buildDailyCapePoints(
      monthly,
      [{ date: "2024-02-05", value: 280 }],
      5,
      [
        {
          date: "2024-02-05",
          open: 270,
          high: 285,
          low: 265,
          close: 275
        }
      ]
    );

    expect(daily[0]).toMatchObject({
      date: "2024-02-05",
      cape: 28,
      priceOhlc: {
        open: 274.91,
        high: 290.18,
        low: 269.82,
        close: 280
      },
      capeOhlc: {
        open: 27.49,
        high: 29.02,
        low: 26.98,
        close: 28
      }
    });
  });
});

describe("parseNasdaqHistoricalJson", () => {
  it("parses Nasdaq historical SPY rows into ascending OHLC observations", () => {
    const rows = parseNasdaqHistoricalJson({
      data: {
        tradesTable: {
          rows: [
            {
              date: "04/24/2026",
              close: "$713.94",
              open: "710.75",
              high: "714.47",
              low: "709.01"
            },
            {
              date: "04/23/2026",
              close: "$708.45",
              open: "709.50",
              high: "712.3598",
              low: "702.2803"
            }
          ]
        }
      }
    });

    expect(rows).toEqual([
      {
        date: "2026-04-23",
        open: 709.5,
        high: 712.36,
        low: 702.28,
        close: 708.45
      },
      {
        date: "2026-04-24",
        open: 710.75,
        high: 714.47,
        low: 709.01,
        close: 713.94
      }
    ]);
  });
});

function buildStableRows(
  startYear: number,
  startMonth: number,
  count: number,
  price: number,
  earnings: number,
  cpi: number
) {
  return Array.from({ length: count }, (_, index) => {
    const date = addMonths(startYear, startMonth, index);
    return [
      Number(`${date.year}.${String(date.month).padStart(2, "0")}`),
      price,
      2,
      earnings,
      cpi,
      date.year + (date.month - 0.5) / 12,
      4,
      price,
      2,
      price,
      earnings,
      earnings,
      "NA"
    ];
  });
}

function addMonths(startYear: number, startMonth: number, offset: number) {
  const zeroBased = startMonth - 1 + offset;
  return {
    year: startYear + Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1
  };
}
