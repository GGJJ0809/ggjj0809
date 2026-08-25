import { useState } from "react";
import { valueServices, bookingRecords } from "@/mocks/valueAdded";
import type { ValueService, BookingRecord } from "@/mocks/valueAdded";
import ValueStats from "./components/ValueStats";
import ServiceCatalog from "./components/ServiceCatalog";
import BookingModal from "./components/BookingModal";
import BookingRecords from "./components/BookingRecords";

export default function ValueAdded() {
  const [bookTarget, setBookTarget] = useState<ValueService | null>(null);
  const [records, setRecords] = useState<BookingRecord[]>(bookingRecords);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleConfirm = (applicant: string, date: string) => {
    if (!bookTarget) return;
    setLoading(true);
    window.setTimeout(() => {
      setRecords((prev) => [
        {
          id: `BK-${Date.now().toString().slice(-8)}`,
          service: bookTarget.name,
          category: bookTarget.category,
          applicant,
          date,
          status: "pending",
        },
        ...prev,
      ]);
      setLoading(false);
      setBookTarget(null);
      showToast(`已提交「${bookTarget.name}」预约申请`);
    }, 600);
  };

  return (
    <div className="space-y-4">
      <ValueStats />

      <ServiceCatalog services={valueServices} onBook={setBookTarget} />

      <BookingRecords records={records} />

      <BookingModal
        service={bookTarget}
        loading={loading}
        onConfirm={handleConfirm}
        onClose={() => setBookTarget(null)}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-foreground-950 px-4 py-3 text-sm text-background-50 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}