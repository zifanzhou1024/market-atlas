import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const positive = z.number().finite().positive();

const BuffettPointSchema = z.object({
  date,
  marketValue: positive,
  gdp: positive,
  gdpDate: date,
  ratio: positive
});

function ascendingSeries(minimum: number) {
  return z.array(BuffettPointSchema).min(minimum).superRefine((points, context) => {
    for (let index = 1; index < points.length; index += 1) {
      if (points[index].date < points[index - 1].date) {
        context.addIssue({
          code: "custom",
          message: "Buffett dates must be monotonically ascending",
          path: [index, "date"]
        });
        break;
      }
    }
  });
}

export const BuffettDatasetSchema = z.object({
  points: ascendingSeries(200),
  worldPoints: ascendingSeries(1),
  globalPoints: ascendingSeries(1),
  marketValueSourceUrl: z.string().url(),
  gdpSourceUrl: z.string().url(),
  worldGdpSourceUrl: z.string().url(),
  worldMarketValueSourceUrl: z.string().url(),
  fetchedAt: z.string().datetime()
});
