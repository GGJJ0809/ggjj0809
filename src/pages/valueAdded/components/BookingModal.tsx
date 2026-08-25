import { useState } from "react";
import type { ValueService } from "@/mocks/valueAdded";

interface BookingModalProps {
  service: ValueService | null;
  loading: boolean;
  onConfirm: (applicant: string, date: string, remarks: string) => void;
  onClose: () => void;
}

export default function BookingModal({ service, loading, onConfirm, onClose }: BookingModalProps) {
  const [applicant, setApplicant] = useState("");
  const [date, setDate] = useState("");
  const [remarks, setRemarks] = useState("");

  if (!service) return null;

  const handleConfirm = () => {
    if (!applicant.trim() || !date) return;
    onConfirm(applicant.trim(), date, remarks.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground-950/40" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-lg border border-background-200 bg-background-50">
        <div className="flex items-center justify-between border-b border-background-200 px-5 py-4">
          <div>
            <h3 className="font-heading text-base font-bold">预约增值服务</h3>
            <p className="text-xs text-foreground-500">
              {service.category} · {service.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground-500 hover:bg-background-100"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-600">预约人</label>
            <input
              type="text"
              value={applicant}
              onChange={(e) => setApplicant(e.target.value)}
              placeholder="如：华信矿业集团 · 李明"
              className="h-10 w-full rounded-md border border-background-200 bg-background-50 px-3 text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-600">预约日期</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 w-full rounded-md border border-background-200 bg-background-50 px-3 text-sm outline-none focus:border-primary-300 cursor-pointer"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-600">备注（选填）</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="补充说明服务需求..."
              className="w-full resize-none rounded-md border border-background-200 bg-background-50 px-3 py-2 text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
            />
            <p className="mt-1 text-right text-[10px] text-foreground-400">{remarks.length}/500</p>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-background-100 px-4 py-3 text-sm">
            <span className="text-foreground-600">服务费用</span>
            <span className="font-semibold text-foreground-900">
              {service.price}
              <span className="text-xs font-normal text-foreground-400">/{service.duration}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-background-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-foreground-600 hover:bg-background-100"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!applicant.trim() || !date || loading}
            className="whitespace-nowrap rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-background-50 hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "提交中..." : "确认预约"}
          </button>
        </div>
      </div>
    </div>
  );
}