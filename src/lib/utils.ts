import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse device timestamp string and store exactly as device provides it
 * Device returns timestamps in format "YYYY-MM-DD HH:MM:SS"
 * This function extracts the exact date/time components and creates a Date object
 * that preserves those exact values, avoiding Docker container timezone issues
 * 
 * @param timestampString - Timestamp string from device (e.g., "2024-01-15 14:30:00")
 * @returns Date object with the exact same date/time values from device
 */
export function parseDeviceTimestamp(timestampString: string | Date): Date {
  // If already a Date object, return as-is
  if (timestampString instanceof Date) {
    return timestampString;
  }

  const str = String(timestampString).trim();
  
  // Handle ISO format (if it has 'T' or 'Z') - parse components directly
  if (str.includes('T') || str.includes('Z')) {
    const isoDate = new Date(str);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }
  }

  // Parse "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD HH:MM:SS.mmm" format
  // Extract exact components: year, month, day, hour, minute, second
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // JavaScript months are 0-indexed
    const day = parseInt(match[3], 10);
    const hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    const second = parseInt(match[6], 10);
    const millisecond = match[7] ? parseInt(match[7].substring(0, 3).padEnd(3, '0'), 10) : 0;
    
    // Create Date using UTC constructor to preserve exact values
    // This stores the exact same date/time the device provided
    const date = new Date(Date.UTC(year, month, day, hour, minute, second, millisecond));
    
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Fallback: try standard parsing
  const fallbackDate = new Date(str);
  if (!isNaN(fallbackDate.getTime())) {
    console.warn(`Parsed device timestamp using fallback method: ${timestampString}`);
    return fallbackDate;
  }
  
  // Last resort: return current date (shouldn't happen with valid device data)
  console.error(`Failed to parse device timestamp: ${timestampString}, using current date`);
  return new Date();
}

/**
 * Format date using UTC methods to display exact stored time
 * This ensures the displayed time matches exactly what was stored from the device
 * 
 * @param date - Date object to format
 * @param formatString - Format string (same as date-fns format)
 * @returns Formatted string using UTC components
 */
export function formatDeviceTimestamp(date: Date, formatString: string): string {
  const pad = (n: number, length: number = 2) => n.toString().padStart(length, '0');
  
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // 1-12
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const milliseconds = date.getUTCMilliseconds();
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthNamesFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  const dayName = dayNames[date.getUTCDay()];
  const monthName = monthNames[month - 1];
  const monthNameFull = monthNamesFull[month - 1];
  
  const hour12 = hours % 12 || 12;
  const ampm = hours < 12 ? 'AM' : 'PM';
  
  let result = formatString;
  
  // Replace format tokens
  result = result.replace(/yyyy/g, pad(year, 4));
  result = result.replace(/yy/g, pad(year % 100));
  result = result.replace(/MMMM/g, monthNameFull);
  result = result.replace(/MMM/g, monthName);
  result = result.replace(/MM/g, pad(month));
  result = result.replace(/M/g, month.toString());
  result = result.replace(/dd/g, pad(day));
  result = result.replace(/d/g, day.toString());
  result = result.replace(/HH/g, pad(hours));
  result = result.replace(/H/g, hours.toString());
  result = result.replace(/hh/g, pad(hour12));
  result = result.replace(/h/g, hour12.toString());
  result = result.replace(/mm/g, pad(minutes));
  result = result.replace(/m/g, minutes.toString());
  result = result.replace(/ss/g, pad(seconds));
  result = result.replace(/s/g, seconds.toString());
  result = result.replace(/SSS/g, pad(milliseconds, 3));
  result = result.replace(/a/g, ampm.toLowerCase());
  result = result.replace(/A/g, ampm);
  result = result.replace(/EEE/g, dayName);
  result = result.replace(/EEEE/g, dayNames[date.getUTCDay()]);
  
  return result;
}

/**
 * Format time for display (HH:mm format using UTC)
 */
export function formatDeviceTime(date: Date): string {
  return formatDeviceTimestamp(date, 'HH:mm');
}

/**
 * Format time for display (h:mm a format using UTC)
 */
export function formatDeviceTime12(date: Date): string {
  return formatDeviceTimestamp(date, 'h:mm a');
}

/**
 * Format date and time for display (MMM dd, yyyy HH:mm:ss format using UTC)
 */
export function formatDeviceDateTime(date: Date): string {
  return formatDeviceTimestamp(date, 'MMM dd, yyyy HH:mm:ss');
}

/**
 * Get date key in YYYY-MM-DD format using UTC (for grouping logs by date)
 * This ensures logs are grouped by the actual date stored, not local timezone
 */
export function getDeviceDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

