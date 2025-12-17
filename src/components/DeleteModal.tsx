import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, RefreshCw, X, LucideIcon } from 'lucide-react';

interface DeleteModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  itemName: string;
  itemType?: string;
  warningMessage?: string;
  customMessage?: string; // Custom message that overrides the default message
  isDeleting?: boolean;
  isSyncing?: boolean;
  icon?: LucideIcon;
  maxWidth?: string;
}

export default function DeleteModal({
  show,
  onClose,
  onConfirm,
  title = 'Confirm Delete',
  itemName,
  itemType,
  warningMessage,
  customMessage,
  isDeleting = false,
  isSyncing = false,
  icon: Icon = AlertTriangle,
  maxWidth = 'max-w-md',
}: DeleteModalProps) {
  if (!show || typeof window === 'undefined') return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isDeleting && !isSyncing) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className={`bg-card rounded-xl w-full ${maxWidth} animate-slide-in-up border border-border flex flex-col`} style={{ maxHeight: '90vh' }}>
        {/* Fixed Header */}
        <div className="flex items-start gap-4 p-6 pb-4 border-b border-border/50 flex-shrink-0 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
          <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <Icon className="w-6 h-6 text-destructive" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground">
              {customMessage ? (
                <span className="text-destructive">{customMessage}</span>
              ) : (
                <>
                  Are you sure you want to delete{' '}
                  {itemType && <span className="text-foreground font-medium">{itemType} </span>}
                  <span className="font-medium text-foreground">"{itemName}"</span>?
                </>
              )}
              {warningMessage && (
                <span className="block mt-2 text-xs text-destructive">
                  {warningMessage}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-all flex-shrink-0"
            disabled={isDeleting || isSyncing}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Fixed Footer */}
        <div className="flex gap-3 p-6 pt-4 flex-shrink-0 sticky bottom-0 bg-card/95 backdrop-blur-sm">
          <button
            onClick={onConfirm}
            disabled={isDeleting || isSyncing}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-destructive hover:bg-destructive/90 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete
              </>
            )}
          </button>
          <button
            onClick={onClose}
            disabled={isDeleting || isSyncing}
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

