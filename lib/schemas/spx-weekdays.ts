import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const finite = z.number().finite();
const weekday = z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);

const WeekdayStatSchema = z.object({
  weekday,
  averageReturn: finite,
  totalReturn: finite,
  winRate: finite.min(0).max(100),
  sampleCount: z.number().int().nonnegative(),
  bestReturn: finite.nullable(),
  bestDate: date.nullable(),
  worstReturn: finite.nullable(),
  worstDate: date.nullable()
});

const CumulativePointSchema = z.object({
  date,
  weekday,
  returnPct: finite,
  cumulativeReturn: finite
});

export const SpxWeekdayPayloadSchema = z.object({
  range: z.enum(["1m", "3m", "6m", "ytd", "1y", "2y", "5y", "10y", "all"]),
  method: z.enum(["openClose", "closeClose"]),
  startDate: date.nullable(),
  endDate: date.nullable(),
  summaryPoints: z.array(WeekdayStatSchema).length(5),
  weekdayStats: z.array(WeekdayStatSchema).length(5),
  cumulativeSeries: z.array(
    z.object({
      weekday,
      points: z.array(CumulativePointSchema).superRefine((points, context) => {
        for (let index = 1; index < points.length; index += 1) {
          if (points[index].date < points[index - 1].date) {
            context.addIssue({
              code: "custom",
              message: "SPX dates must be monotonically ascending",
              path: [index, "date"]
            });
            break;
          }
        }
      })
    })
  ).length(5),
  source: z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    displayName: z.string().min(1),
    provider: z.string().min(1),
    url: z.string().url()
  })
});
