import React from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle, AlertTriangle, X, LucideIcon, Loader2 } from 'lucide-react';

interface ConfirmationModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
  icon?: LucideIcon;
  isProcessing?: boolean;
  maxWidth?: string;
}

export default function ConfirmationModal({
  show,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'info',
  icon: Icon,
  isProcessing = false,
  maxWidth = 'max-w-md',
}: ConfirmationModalProps) {
  if (!show || typeof window === 'undefined') return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isProcessing) {
      onClose();
    }
  };

  // Determine icon and colors based on type
  let defaultIcon: LucideIcon = AlertCircle;
  let iconBgClass = 'bg-blue-500/10';
  let iconColorClass = 'text-blue-500';
  let confirmButtonClass = 'bg-primary hover:bg-primary/90 text-white';

  if (type === 'danger') {
    defaultIcon = AlertTriangle;
    iconBgClass = 'bg-destructive/10';
    iconColorClass = 'text-destructive';
    confirmButtonClass = 'bg-destructive hover:bg-destructive/90 text-white';
  } else if (type === 'warning') {
    defaultIcon = AlertTriangle;
    iconBgClass = 'bg-yellow-500/10';
    iconColorClass = 'text-yellow-500';
    confirmButtonClass = 'bg-yellow-500 hover:bg-yellow-600 text-white';
  } else if (type === 'success') {
    defaultIcon = CheckCircle;
    iconBgClass = 'bg-green-500/10';
    iconColorClass = 'text-green-500';
    confirmButtonClass = 'bg-green-500 hover:bg-green-600 text-white';
  }

  const DisplayIcon = Icon || defaultIcon;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className={`bg-card rounded-xl w-full ${maxWidth} animate-slide-in-up border border-border flex flex-col shadow-xl`} style={{ maxHeight: '90vh' }}>
        {/* Fixed Header */}
        <div className="flex items-start gap-4 p-6 pb-4 border-b border-border/50 flex-shrink-0 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
          <div className={`w-12 h-12 rounded-lg ${iconBgClass} flex items-center justify-center flex-shrink-0`}>
            <DisplayIcon className={`w-6 h-6 ${iconColorClass}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 hover:bg-secondary rounded-lg transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 pt-4">
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {message}
          </p>
        </div>

        {/* Fixed Footer */}
        <div className="flex gap-3 p-6 pt-4 border-t border-border/50 flex-shrink-0 sticky bottom-0 bg-card/95 backdrop-blur-sm">
          <button
            onClick={onConfirm}
            disabled={isProcessing}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 ${confirmButtonClass} rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              confirmText
            )}
          </button>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-6 py-3 bg-secondary hover:bg-secondary/80 rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

