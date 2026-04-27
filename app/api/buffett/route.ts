import { NextResponse } from "next/server";
import { fetchBuffettData } from "../../../lib/buffett";

export const revalidate = 21600;

export async function GET() {
  try {
    const dataset = await fetchBuffettData();
    return NextResponse.json(dataset);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load Buffett indicator data"
      },
      { status: 502 }
    );
  }
}
