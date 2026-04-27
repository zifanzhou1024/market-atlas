import { NextResponse } from "next/server";
import { loadSpxWeekdayData } from "../../../lib/spx-weekday-service";
import { normalizeSpxWeekdayQuery } from "../../../lib/spx-weekdays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = normalizeSpxWeekdayQuery({
    range: searchParams.get("range"),
    method: searchParams.get("method")
  });

  try {
    return NextResponse.json(await loadSpxWeekdayData(query));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load SPX weekday performance data"
      },
      { status: 502 }
    );
  }
}
