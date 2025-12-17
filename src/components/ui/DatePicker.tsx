'use client';

import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import Popover from '@/components/Popover';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value?: string | Date;
  onChange?: (value: any) => void;
  onBlur?: () => void;
  placeholder?: string;
  required?: boolean;
  min?: string;
  max?: string;
  label?: string;
  helpText?: string;
  error?: boolean;
  errorMessage?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  onBlur,
  placeholder = 'Select date',
  required,
  min,
  max,
  label,
  helpText,
  error,
  errorMessage,
  className = '',
  id,
  disabled,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  // Handle both string and Date object inputs
  const dateValue = React.useMemo(() => {
    if (!value) return undefined;
    if (value instanceof Date) return value;

    try {
      // Parse YYYY-MM-DD format directly to avoid timezone conversion issues
      const [year, month, day] = value.split('-').map(Number);
      if (year && month && day) {
        const date = new Date(year, month - 1, day);
        // Validate the date is correct
        if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
          return date;
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }, [value]);

  // Convert min/max to Date objects for validation
  const minDate = React.useMemo(() => {
    if (!min) return undefined;
    try {
      const [year, month, day] = min.split('-').map(Number);
      if (year && month && day) {
        return new Date(year, month - 1, day);
      }
      return undefined;
    } catch {
      return undefined;
    }
  }, [min]);

  const maxDate = React.useMemo(() => {
    if (!max) return undefined;
    try {
      const [year, month, day] = max.split('-').map(Number);
      if (year && month && day) {
        return new Date(year, month - 1, day);
      }
      return undefined;
    } catch {
      return undefined;
    }
  }, [max]);

  const formatDate = React.useCallback((date: Date): string => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}-${day}-${year}`;
  }, []);

  const handleDateSelect = React.useCallback((date: Date | undefined) => {
    if (date) {
      // Call onChange to update parent state
      onChange?.(date as any);
      
      // Close popover after a small delay to allow the selection to complete
      // This prevents jittering and ensures the date is properly selected
      setTimeout(() => {
        setIsOpen(false);
      }, 150);
      
      // Call onBlur after popover closes if provided
      setTimeout(() => {
      onBlur?.();
      }, 200);
    }
  }, [onChange, onBlur]);

  const isDateDisabled = React.useCallback((date: Date) => {
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  }, [minDate, maxDate]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <Popover
        open={isOpen}
        onOpenChange={setIsOpen}
        trigger={
          <Button
            variant="outline"
            id={id}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal bg-secondary/50 text-foreground border-border",
              !dateValue && "text-muted-foreground",
              error && "border-destructive"
            )}
          >
            {dateValue ? formatDate(dateValue) : placeholder}
            <ChevronDownIcon className="h-4 w-4 opacity-50 ml-2" />
          </Button>
        }
        className="w-auto overflow-hidden p-0 z-[10001]"
        position="bottom"
        align="start"
      >
        <div onClick={(e) => e.stopPropagation()}>
        <Calendar
          mode="single"
          selected={dateValue}
          captionLayout="dropdown"
          onSelect={handleDateSelect}
            disabled={isDateDisabled}
          fromYear={1970}
          toYear={2050}
          initialFocus
        />
        </div>
      </Popover>
      {error && errorMessage && (
        <p className="text-xs text-destructive">{errorMessage}</p>
      )}
      {helpText && !error && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
};
