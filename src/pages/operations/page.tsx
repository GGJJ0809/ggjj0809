import OperationsStats from "./components/OperationsStats";
import OperationsPanel from "./components/OperationsPanel";

export default function Operations() {
  return (
    <div className="space-y-4">
      <OperationsStats />
      <OperationsPanel />
    </div>
  );
}