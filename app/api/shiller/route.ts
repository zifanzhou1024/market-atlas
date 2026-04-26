import { NextResponse } from "next/server";
import { fetchShillerData } from "../../../lib/shiller";
import { getDashboardSnapshot } from "../../../lib/market-metrics";

export const revalidate = 21600;

export async function GET() {
  try {
    const dataset = await fetchShillerData();
    const snapshot = getDashboardSnapshot(
      dataset.points,
      dataset.points[dataset.points.length - 1].date
    );

    return NextResponse.json({
      ...dataset,
      snapshot
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to load Shiller data"
      },
      { status: 502 }
    );
  }
}
