import React, { useEffect } from 'react';
import { Check, AlertCircle, Activity, X } from 'lucide-react';

interface NotificationProps {
  type: 'success' | 'error' | 'info';
  message: string;
  onClose: () => void;
  autoClose?: boolean;
}

export default function Notification({ type, message, onClose, autoClose = false }: NotificationProps) {
  useEffect(() => {
    if (autoClose) {
      const timer = setTimeout(() => {
        onClose();
      }, 2000); // Auto-close after 2 seconds

      return () => clearTimeout(timer);
    }
  }, [autoClose, onClose]);

  return (
    <div 
      className={`fixed top-20 right-4 z-[99999] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg animate-slide-in-right max-w-md glass-card ${
        type === 'success' ? 'bg-accent/20 border border-accent/30 text-accent' :
        type === 'error' ? 'bg-destructive/20 border border-destructive/30 text-destructive' :
        'bg-primary/20 border border-primary/30 text-primary'
      }`}
      style={{ zIndex: 99999 }}
    >
      {type === 'success' && <Check className="w-4 h-4 flex-shrink-0" />}
      {type === 'error' && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
      {type === 'info' && <Activity className="w-4 h-4 flex-shrink-0" />}
      <span className="text-sm font-medium flex-1">{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-70 flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

