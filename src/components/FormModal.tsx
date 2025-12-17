import React, { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, Check, LucideIcon } from 'lucide-react';

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'dropdown' | 'number' | 'custom';
  value: any;
  onChange: (value: any) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  options?: Array<{ value: string | number; label: string; disabled?: boolean }>;
  customComponent?: ReactNode;
  rows?: number;
  className?: string;
}

interface FormModalProps {
  show: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  fields: FormField[];
  onSubmit: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  isValid?: boolean;
  maxWidth?: string;
}

export default function FormModal({
  show,
  onClose,
  title,
  subtitle,
  icon: Icon,
  iconColor = 'text-primary',
  fields,
  onSubmit,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  isSubmitting = false,
  isValid = true,
  maxWidth = 'max-w-md',
}: FormModalProps) {
  if (!show || typeof window === 'undefined') return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  const renderField = (field: FormField) => {
    switch (field.type) {
      case 'text':
      case 'number':
        return (
          <input
            type={field.type}
            value={field.value || ''}
            onChange={(e) => field.onChange(field.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
            placeholder={field.placeholder}
            disabled={field.disabled || isSubmitting}
            className={`w-full px-4 py-3 bg-secondary border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 transition-all ${field.className || ''}`}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={field.value || ''}
            onChange={(e) => field.onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={field.rows || 3}
            disabled={field.disabled || isSubmitting}
            className={`w-full px-4 py-3 bg-secondary border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 transition-all resize-none ${field.className || ''}`}
          />
        );

      case 'dropdown':
        // For dropdown, we expect a custom component to be passed
        return field.customComponent || null;

      case 'custom':
        return field.customComponent || null;

      default:
        return null;
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div
        className={`bg-card rounded-xl w-full ${maxWidth} animate-slide-in-up border border-border flex flex-col`}
        style={{ maxHeight: '90vh' }}
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border/50 flex-shrink-0 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className={`w-10 h-10 rounded-lg bg-secondary flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold">{title}</h3>
              {subtitle && (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-all flex-shrink-0"
            disabled={isSubmitting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 pt-4">
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.name || index}>
                <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                  {!field.required && field.type !== 'custom' && (
                    <span className="text-muted-foreground/70 font-normal ml-1">(Optional)</span>
                  )}
                </label>
                {renderField(field)}
              </div>
            ))}
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="flex gap-3 p-6 pt-4 border-t border-border/50 flex-shrink-0 sticky bottom-0 bg-card/95 backdrop-blur-sm">
          <button
            onClick={onSubmit}
            disabled={isSubmitting || !isValid}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                {submitLabel}
              </>
            )}
          </button>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-6 py-3 bg-secondary hover:bg-secondary/80 rounded-lg font-medium text-sm transition-all disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

