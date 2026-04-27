import { SpxWeekdayDashboard } from "./spx-weekday-dashboard";
import { loadSpxWeekdayPageDataset } from "../../lib/pages-data";

export const metadata = {
  title: "SPX weekdays | Market Atlas"
};

export default async function SpxWeekdaysPage() {
  try {
    const initialDataset = await loadSpxWeekdayPageDataset();

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
