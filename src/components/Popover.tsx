'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function Popover({
  trigger,
  children,
  position = 'bottom',
  align = 'center',
  className = '',
  open: controlledOpen,
  onOpenChange
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  
  const setIsOpen = (value: boolean) => {
    if (!isControlled) {
      setInternalOpen(value);
    }
    onOpenChange?.(value);
  };
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !popoverRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();

    // For fixed positioning, we use viewport coordinates directly
    // No need to add window.scrollY/scrollX

    let top = 0;
    let left = 0;

    // Calculate position based on position prop
    switch (position) {
      case 'top':
        top = triggerRect.top - popoverRect.height - 8;
        break;
      case 'bottom':
        top = triggerRect.bottom + 8;
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height - popoverRect.height) / 2;
        left = triggerRect.left - popoverRect.width - 8;
        break;
      case 'right':
        top = triggerRect.top + (triggerRect.height - popoverRect.height) / 2;
        left = triggerRect.right + 8;
        break;
    }

    // Calculate alignment
    switch (align) {
      case 'start':
        if (position === 'top' || position === 'bottom') {
          left = triggerRect.left;
        } else {
          // For left/right, alignment is on the vertical axis
          top = triggerRect.top;
        }
        break;
      case 'center':
        if (position === 'top' || position === 'bottom') {
          left = triggerRect.left + (triggerRect.width - popoverRect.width) / 2;
        }
        // For left/right, center is already handled above
        break;
      case 'end':
        if (position === 'top' || position === 'bottom') {
          left = triggerRect.right - popoverRect.width;
        } else {
          top = triggerRect.bottom - popoverRect.height;
        }
        break;
    }

    // Keep popover within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 10;

    if (left + popoverRect.width > viewportWidth - padding) {
      left = viewportWidth - popoverRect.width - padding;
    }
    if (left < padding) {
      left = padding;
    }
    if (top + popoverRect.height > viewportHeight - padding) {
      // If it overflows bottom, flip to top if positioned bottom
      if (position === 'bottom') {
        top = triggerRect.top - popoverRect.height - 8;
      } else {
        top = viewportHeight - popoverRect.height - padding;
      }
    }
    if (top < padding) {
      // If it overflows top, flip to bottom if positioned top
      if (position === 'top') {
        top = triggerRect.bottom + 8;
      } else {
        top = padding;
      }
    }

    setPopoverPosition({ top, left });
    setIsPositioned(true);
  }, [position, align]);

  useLayoutEffect(() => {
    if (isOpen) {
      // Use requestAnimationFrame to ensure DOM is fully laid out
      requestAnimationFrame(() => {
        updatePosition();
      });
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        triggerRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleResizeOrScroll = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true); // Capture phase for scrolling elements

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);
    };
  }, [isOpen, updatePosition]);

  const getArrowClass = () => {
    const baseClass = 'absolute w-0 h-0';
    // The arrow direction depends on the actual visual position, 
    // but simplified logic assumes it sticks to the requested position unless flipped.
    // For robust flipping support, we'd need to track the 'actualPosition' state.
    // For now, using the prop position.
    switch (position) {
      case 'top':
        return `${baseClass} bottom-[-6px] left-1/2 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-card`;
      case 'bottom':
        return `${baseClass} top-[-6px] left-1/2 -translate-x-1/2 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-card`;
      case 'left':
        return `${baseClass} right-[-6px] top-1/2 -translate-y-1/2 border-t-[6px] border-b-[6px] border-l-[6px] border-t-transparent border-b-transparent border-l-card`;
      case 'right':
        return `${baseClass} left-[-6px] top-1/2 -translate-y-1/2 border-t-[6px] border-b-[6px] border-r-[6px] border-t-transparent border-b-transparent border-r-card`;
      default:
        return '';
    }
  };

  return (
    <div className="relative inline-block">
      <div
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          if (!isOpen) setIsPositioned(false);
          setIsOpen(!isOpen);
        }}
        className="cursor-pointer"
      >
        {trigger}
      </div>

      {isOpen && isMounted && createPortal(
        <div
          ref={popoverRef}
          className={`fixed z-[9999] bg-card border border-border rounded-lg shadow-xl p-4 min-w-[200px] max-w-[300px] animate-in ${className}`}
          style={{
            top: `${popoverPosition.top}px`,
            left: `${popoverPosition.left}px`,
            // Hide until positioned (avoid jumping)
            visibility: isPositioned ? 'visible' : 'hidden',
            opacity: isPositioned ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={getArrowClass()} />
          <div className="relative">
            {children}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
