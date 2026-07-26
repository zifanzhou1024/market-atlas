import { SpxWeekdayDashboard } from "./spx-weekday-dashboard";
import {
  loadDataManifest,
  loadSpxWeekdayPageDataset
} from "../../lib/pages-data";

export const metadata = {
  title: "SPX weekdays | Market Atlas"
};

export default async function SpxWeekdaysPage() {
  try {
    const [initialDataset, manifest] = await Promise.all([
      loadSpxWeekdayPageDataset(),
      loadDataManifest()
    ]);

    return (
      <SpxWeekdayDashboard
        initialDataset={initialDataset}
        sourceStatus={manifest.sources.spxWeekdays}
      />
    );
  } catch (error) {
    return (
      <SpxWeekdayDashboard
        initialDataset={null}
        sourceStatus={null}
        initialError={
          error instanceof Error
            ? error.message
            : "Unable to load SPX weekday performance data"
        }
      />
    );
  }
}
