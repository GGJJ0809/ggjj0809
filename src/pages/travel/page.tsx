import { useState } from "react";
import { travelers } from "@/mocks/travel";
import TravelStats from "./components/TravelStats";
import TrackingMap from "./components/TrackingMap";
import TravelerList from "./components/TravelerList";
import BriefingPanel from "./components/BriefingPanel";

export default function Travel() {
  const [selectedId, setSelectedId] = useState(travelers[0].id);

  return (
    <div className="space-y-4">
      <TravelStats />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="h-[560px] xl:col-span-2">
          <TrackingMap selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="h-[560px] xl:col-span-1">
          <TravelerList selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>

      <BriefingPanel />
    </div>
  );
}