import { useState } from "react";
import type { Provider } from "@/mocks/security";

interface OrderModalProps {
  provider: Provider | null;
  loading: boolean;
  onConfirm: (service: string, region: string, duration: number) => void;
  onClose: () => void;
}

export default function OrderModal({ provider, loading, onConfirm, onClose }: OrderModalProps) {
  const [service, setService] = useState("");
  const [region, setRegion] = useState("");
  const [duration, setDuration] = useState(1);

  if (!provider) return null;

  const selectedService = provider.services.find((s) => s.name === service);

  const handleConfirm = () => {
    if (!service || !region.trim()) return;
    onConfirm(service, region.trim(), duration);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground-950/40" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-lg border border-background-200 bg-background-50">
        <div className="flex items-center justify-between border-b border-background-200 px-5 py-4">
          <div>
            <h3 className="font-heading text-base font-bold">下单安保服务</h3>
            <p className="text-xs text-foreground-500">{provider.name}</p>
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
            <label className="mb-1.5 block text-xs font-medium text-foreground-600">选择服务</label>
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="h-10 w-full rounded-md border border-background-200 bg-background-50 px-3 text-sm outline-none focus:border-primary-300 cursor-pointer"
            >
              <option value="">请选择服务类型</option>
              {provider.services.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}（{s.price}/{s.unit}）
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-600">服务区域</label>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="如：刚果（金）戈马"
              className="h-10 w-full rounded-md border border-background-200 bg-background-50 px-3 text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-600">
              服务时长（天）：<span className="text-foreground-900">{duration}</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDuration((d) => Math.max(1, d - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-background-100 text-foreground-700 hover:bg-background-200"
              >
                <i className="ri-subtract-line" />
              </button>
              <span className="w-10 text-center text-sm font-semibold">{duration}</span>
              <button
                type="button"
                onClick={() => setDuration((d) => d + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-background-100 text-foreground-700 hover:bg-background-200"
              >
                <i className="ri-add-line" />
              </button>
            </div>
          </div>

          {selectedService && (
            <div className="flex items-center justify-between rounded-lg bg-background-100 px-4 py-3 text-sm">
              <span className="text-foreground-600">预估金额</span>
              <span className="font-semibold text-foreground-900">{selectedService.price} / {selectedService.unit}</span>
            </div>
          )}
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
            disabled={!service || !region.trim() || loading}
            className="whitespace-nowrap rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-background-50 hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "提交中..." : "确认下单"}
          </button>
        </div>
      </div>
    </div>
  );
}