import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const finite = z.number().finite();
const positive = finite.positive();
const nullablePositive = positive.nullable();

const OhlcSchema = z.object({
  open: positive,
  high: positive,
  low: positive,
  close: positive
});

const ShillerPointSchema = z.object({
  date,
  cape: positive.lt(200),
  price: nullablePositive,
  priceOhlc: OhlcSchema.nullable().optional(),
  earnings: nullablePositive,
  longRate: finite.nullable(),
  cpi: nullablePositive.optional(),
  realPrice: nullablePositive.optional(),
  realEarnings: nullablePositive.optional(),
  avgRealEarnings: nullablePositive.optional(),
  capeOhlc: OhlcSchema.nullable().optional(),
  sourceCape: nullablePositive.optional(),
  frequency: z.enum(["monthly", "daily"]).optional(),
  source: z.string().min(1).optional()
});

export const ShillerDatasetSchema = z.object({
  points: z.array(ShillerPointSchema).min(1500).superRefine((points, context) => {
    for (let index = 1; index < points.length; index += 1) {
      if (points[index].date < points[index - 1].date) {
        context.addIssue({
          code: "custom",
          message: "Shiller dates must be monotonically ascending",
          path: [index, "date"]
        });
        break;
      }
    }
  }),
  sourceUrl: z.string().url(),
  dailySourceUrl: z.string().url().nullable(),
  ohlcSourceUrl: z.string().url().nullable(),
  fetchedAt: z.string().datetime()
});
