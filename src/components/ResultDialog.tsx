import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { AlertCircle, AlertTriangle, CheckCircle, X } from 'lucide-react';

type DialogType = 'info' | 'warning' | 'success' | 'danger';

interface ResultDialogProps {
  title: string;
  message: string;
  type?: DialogType;
  onClose?: () => void;
}

export function ResultDialog({ title, message, type = 'info', onClose }: ResultDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const iconProps = {
    success: { bg: 'bg-green-500/10', color: 'text-green-500', Icon: CheckCircle },
    warning: { bg: 'bg-yellow-500/10', color: 'text-yellow-500', Icon: AlertTriangle },
    danger: { bg: 'bg-destructive/10', color: 'text-destructive', Icon: AlertTriangle },
    info: { bg: 'bg-blue-500/10', color: 'text-blue-500', Icon: AlertCircle },
  }[type];

  return createPortal(
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="bg-card rounded-xl w-full max-w-md animate-slide-in-up border border-border flex flex-col shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 p-6 pb-4 border-b border-border/50 flex-shrink-0">
          <div className={`w-12 h-12 rounded-lg ${iconProps.bg} flex items-center justify-center flex-shrink-0`}>
            <iconProps.Icon className={`w-6 h-6 ${iconProps.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-all flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-4">
          <pre className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {message}
          </pre>
        </div>

        <div className="flex gap-3 p-6 pt-4 border-t border-border/50 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg font-medium text-sm transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface ShowResultDialogOptions extends ResultDialogProps {}

export function showResultDialog(options: ShowResultDialogOptions) {
  if (typeof window === 'undefined') return;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const handleClose = () => {
    root.unmount();
    container.remove();
    options.onClose?.();
  };
  root.render(<ResultDialog {...options} onClose={handleClose} />);
}

