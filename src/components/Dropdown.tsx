import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface DropdownOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  value?: string | number | null;
  onChange: (value: string | number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  error?: string;
  required?: boolean;
  searchable?: boolean;
  emptyMessage?: string;
}

export default function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select an option...',
  disabled = false,
  className = '',
  label,
  error,
  required = false,
  searchable = false,
  emptyMessage = 'No options available',
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Filter options based on search
  const filteredOptions = searchable && searchTerm
    ? options.filter(opt =>
      opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    )
    : options;

  // Get selected option label
  const selectedOption = options.find(opt => opt.value === value);
  const displayValue = selectedOption ? selectedOption.label : placeholder;

  // Calculate dropdown position
  const updatePosition = () => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      // Get actual height if available, otherwise assume max height
      const dropdownHeight = dropdownRef.current?.offsetHeight || 300;

      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;

      // Flip provided it doesn't fit below AND fits better above
      const shouldPositionAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

      const top = shouldPositionAbove
        ? rect.top - dropdownHeight - 4
        : rect.bottom + 4;

      // Ensure dropdown doesn't go off-screen horizontally
      const left = Math.max(4, Math.min(
        rect.left,
        viewportWidth - rect.width - 4
      ));

      setPosition({
        top,
        left,
        width: rect.width,
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        updatePosition();
      });

      // Update position on scroll and resize
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, options]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close dropdown on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleSelect = (optionValue: string | number) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`
            w-full px-3 py-2.5 bg-secondary border rounded-lg text-sm
            flex items-center justify-between gap-2
            transition-all
            ${error
              ? 'border-destructive focus:ring-2 focus:ring-destructive/20'
              : 'border-border focus:ring-2 focus:ring-primary/20'
            }
            ${disabled
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:border-primary/30 cursor-pointer'
            }
            ${!selectedOption ? 'text-muted-foreground' : 'text-foreground'}
          `}
        >
          <span className="flex-1 text-left truncate">{displayValue}</span>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''
              }`}
          />
        </button>

        {error && (
          <p className="mt-1.5 text-xs text-destructive">{error}</p>
        )}

        {/* Dropdown Menu */}
        {isOpen && typeof window !== 'undefined' && createPortal(
          <div
            ref={dropdownRef}
            className="bg-card border border-border shadow-xl z-[10001] animate-fade-in rounded-lg"
            style={{
              position: 'fixed',
              top: `${position.top}px`,
              left: `${position.left}px`,
              width: `${position.width}px`,
              maxHeight: '300px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {searchable && (
              <div className="p-2 border-b border-border">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="w-full px-3 py-2 bg-secondary border border-border rounded text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}

            <div className="overflow-y-auto max-h-[250px] scrollbar-thin scrollbar-thumb-secondary scrollbar-track-transparent">
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </div>
              ) : (
                <div className="p-1">
                  {filteredOptions.map((option) => {
                    const isSelected = option.value === value;
                    const isDisabled = option.disabled || false;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => !isDisabled && handleSelect(option.value)}
                        disabled={isDisabled}
                        className={`
                          w-full px-3 py-2.5 rounded-lg text-sm text-left
                          flex items-center justify-between gap-2
                          transition-all
                          ${isSelected
                            ? 'bg-secondary text-primary font-medium'
                            : 'text-foreground hover:bg-secondary'
                          }
                          ${isDisabled
                            ? 'opacity-50 cursor-not-allowed'
                            : 'cursor-pointer'
                          }
                        `}
                      >
                        <span className="flex-1 truncate">{option.label}</span>
                        {isSelected && (
                          <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}

