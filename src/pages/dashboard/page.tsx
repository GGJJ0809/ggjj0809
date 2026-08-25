import KpiCards from "./components/KpiCards";
import RiskMap from "./components/RiskMap";
import AlertFeed from "./components/AlertFeed";
import RiskDistribution from "./components/RiskDistribution";

export default function Dashboard() {
  return (
    <div className="space-y-4">
      <KpiCards />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RiskMap />
        </div>
        <div>
          <AlertFeed />
        </div>
      </div>

      <RiskDistribution />
    </div>
  );
}