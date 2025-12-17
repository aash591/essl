import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Clock, RefreshCw, X, AlertCircle, Check, Edit } from 'lucide-react';
import { Device } from '@/types';
import { format } from 'date-fns';

interface DeviceTimeModalProps {
  show: boolean;
  onClose: () => void;
  device: Device | null;
  onGetTime: (device: Device) => Promise<void>;
  onSetTime: (device: Device) => Promise<void>;
}

// Set Time Modal Component
interface SetTimeModalProps {
  device: Device | null;
  systemTime: string;
  onClose: () => void;
  onSetTime: (time?: string) => Promise<void>;
}

function SetTimeModal({ device, systemTime: initialSystemTime, onClose, onSetTime }: SetTimeModalProps) {
  const [useSystemTime, setUseSystemTime] = useState(true);
  const [customTime, setCustomTime] = useState('');
  const [isSetting, setIsSetting] = useState(false);
  const [currentSystemTime, setCurrentSystemTime] = useState(initialSystemTime);

  // Update system time every second
  useEffect(() => {
    const updateSystemTime = () => {
      setCurrentSystemTime(format(new Date(), 'yyyy-MM-dd HH:mm:ss'));
    };
    updateSystemTime();
    const interval = setInterval(updateSystemTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Initialize custom time with system time
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    setCustomTime(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}`);
  }, []);

  const handleSubmit = async () => {
    setIsSetting(true);
    try {
      if (useSystemTime) {
        await onSetTime();
      } else {
        await onSetTime(customTime);
      }
    } finally {
      setIsSetting(false);
    }
  };

  if (!device) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass-card rounded-xl w-full max-w-md animate-slide-in-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500/20 to-blue-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Set Device Time</h3>
              <p className="text-sm text-muted-foreground">{device.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-all flex-shrink-0"
            disabled={isSetting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 pt-4">
          <div className="space-y-6">
            {/* System Time Display */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                Current System Time
              </label>
              <div className="px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm font-mono">
                {currentSystemTime}
              </div>
            </div>

            {/* Option Selection */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  id="useSystemTime"
                  checked={useSystemTime}
                  onChange={() => setUseSystemTime(true)}
                  className="w-4 h-4 text-orange-500"
                  disabled={isSetting}
                />
                <label htmlFor="useSystemTime" className="text-sm cursor-pointer">
                  Use system time (computer's current time)
                </label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  id="useCustomTime"
                  checked={!useSystemTime}
                  onChange={() => setUseSystemTime(false)}
                  className="w-4 h-4 text-orange-500"
                  disabled={isSetting}
                />
                <label htmlFor="useCustomTime" className="text-sm cursor-pointer">
                  Set custom time
                </label>
              </div>
            </div>

            {/* Custom Time Input */}
            {!useSystemTime && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  Custom Time
                </label>
                <input
                  type="datetime-local"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="w-full px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-orange-500/20 transition-all"
                  disabled={isSetting}
                />
              </div>
            )}

            {/* Confirmation Message */}
            <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <p className="text-xs text-orange-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Are you sure you want to update the device time?
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 pt-4 border-t border-border/50 flex-shrink-0">
          <button
            onClick={handleSubmit}
            disabled={isSetting || (!useSystemTime && !customTime)}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-500/90 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSetting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Setting...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Set Time
              </>
            )}
          </button>
          <button
            onClick={onClose}
            disabled={isSetting}
            className="px-6 py-3 bg-secondary hover:bg-secondary/80 rounded-lg font-medium text-sm transition-all disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function DeviceTimeModal({
  show,
  onClose,
  device,
  onGetTime,
  onSetTime
}: DeviceTimeModalProps) {
  const [deviceTime, setDeviceTime] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetTimeModal, setShowSetTimeModal] = useState(false);

  const handleGetTime = useCallback(async () => {
    if (!device) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/device/time/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: device.ip,
          port: device.port,
        }),
      });

      const data = await response.json();

      if (data.success && data.data) {
        setDeviceTime(data.data.deviceTime);
      } else {
        setError(data.error || 'Failed to get device time');
      }
    } catch (error) {
      setError('Failed to connect to device');
    } finally {
      setIsLoading(false);
    }
  }, [device]);

  // Fetch device time when modal opens
  useEffect(() => {
    if (show && device) {
      handleGetTime();
    } else {
      setDeviceTime(null);
      setError(null);
      setShowSetTimeModal(false);
    }
  }, [show, device, handleGetTime]);

  const handleSetTimeClick = () => {
    setShowSetTimeModal(true);
  };

  if (!show || typeof window === 'undefined' || !device) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
    >
      <div
        className="glass-card rounded-xl w-full max-w-md animate-slide-in-up flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-orange-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Device Time</h3>
              <p className="text-sm text-muted-foreground">{device.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-all flex-shrink-0"
            disabled={isLoading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 pt-4">
          <div className="space-y-6">
            {/* Device Time */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Device Time
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGetTime}
                    disabled={isLoading}
                    className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-lg text-xs font-medium transition-all disabled:opacity-50 flex items-center gap-1.5"
                    title="Refresh device time"
                  >
                    {isLoading ? (
                      <><RefreshCw className="w-3 h-3 animate-spin" /> Loading...</>
                    ) : (
                      <><RefreshCw className="w-3 h-3" /> Refresh</>
                    )}
                  </button>
                  <button
                    onClick={handleSetTimeClick}
                    disabled={isLoading}
                    className="p-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 rounded-lg transition-all disabled:opacity-50"
                    title="Set device time"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm font-mono">
                {deviceTime || (isLoading ? 'Loading...' : 'Click Refresh to get device time')}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {error}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 pt-4 border-t border-border/50 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-6 py-3 bg-secondary hover:bg-secondary/80 rounded-lg font-medium text-sm transition-all disabled:opacity-50"
          >
            Close
          </button>
        </div>

        {/* Set Time Modal */}
        {showSetTimeModal && (
          <SetTimeModal
            device={device}
            systemTime={format(new Date(), 'yyyy-MM-dd HH:mm:ss')}
            onClose={() => setShowSetTimeModal(false)}
            onSetTime={async (time?: string) => {
              if (!device) return;
              
              try {
                if (time) {
                  // Set custom time
                  const response = await fetch('/api/device/time/set', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      ip: device.ip,
                      port: device.port,
                      time: new Date(time).toISOString(),
                    }),
                  });
                  const data = await response.json();
                  if (data.success) {
                    await onSetTime(device);
                  } else {
                    setError(data.error || 'Failed to set device time');
                  }
                } else {
                  // Set to system time
                  await onSetTime(device);
                }
                // Refresh device time after setting
                setTimeout(() => {
                  handleGetTime();
                }, 1000);
                setShowSetTimeModal(false);
              } catch (error) {
                setError('Failed to set device time');
              }
            }}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
