import { SpxWeekdayDashboard } from "./spx-weekday-dashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SPX weekdays | Market Atlas"
};

async function fetchInitialDataset() {
  const { loadSpxWeekdayData } = await import("../../lib/spx-weekday-service");
  return loadSpxWeekdayData({ range: "1y", method: "openClose" });
}

export default async function SpxWeekdaysPage() {
  try {
    const initialDataset = await fetchInitialDataset();

    return <SpxWeekdayDashboard initialDataset={initialDataset} />;
  } catch (error) {
    return (
      <SpxWeekdayDashboard
        initialDataset={null}
        initialError={
          error instanceof Error
            ? error.message
            : "Unable to load SPX weekday performance data"
        }
      />
    );
  }
}
