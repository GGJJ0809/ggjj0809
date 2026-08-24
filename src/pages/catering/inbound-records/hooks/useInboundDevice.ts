import { useState, useCallback } from 'react';

export interface BoundDevice {
  id: number;
  device_no: string;
  device_name: string;
  device_sn: string;
  device_ip: string | null;
  device_key: string;
  zone: string;
  canteen: string;
  stall: string | null;
  comm_protocol: string | null;
  status: string | null;
}

const STORAGE_KEY = 'inbound_bound_device';

function loadBoundDevice(): BoundDevice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as BoundDevice;
  } catch {
    // ignore
  }
  return null;
}

function saveBoundDevice(device: BoundDevice | null): void {
  if (device) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(device));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function useInboundDevice() {
  const [boundDevice, setBoundDeviceState] = useState<BoundDevice | null>(loadBoundDevice);

  const bindDevice = useCallback((device: BoundDevice) => {
    saveBoundDevice(device);
    setBoundDeviceState(device);
  }, []);

  const unbindDevice = useCallback(() => {
    saveBoundDevice(null);
    setBoundDeviceState(null);
  }, []);

  const isBound = Boolean(boundDevice);

  return { boundDevice, bindDevice, unbindDevice, isBound };
}