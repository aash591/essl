import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, Download, ChevronLeft, ChevronRight, Users, Search } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, eachDayOfInterval, differenceInDays, addMonths, subMonths, isSameDay } from 'date-fns';
import { AttendanceLog, User } from '@/types';
import { Calendar, type DateRange } from '@/components/ui/calendar';
import Popover from '@/components/Popover';
import { formatDeviceTime, formatDeviceTime12, formatDeviceTimestamp, getDeviceDateKey } from '@/lib/utils';

interface AttendanceBookProps {
  attendance: AttendanceLog[];
  allUsers?: User[];
  isLoading: boolean;
  onDateRangeChange?: (startDate: Date, endDate: Date) => void;
}

interface DayAttendance {
  date: Date;
  checkIn?: Date;
  checkOut?: Date;
  hasAttendance: boolean;
  logs: Date[];
}

interface UserAttendance {
  userId: string;
  name: string;
  days: Map<string, DayAttendance>;
}

export default function AttendanceBook({
  attendance,
  allUsers = [],
  isLoading,
  onDateRangeChange
}: AttendanceBookProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const PAGE_SIZE = 100;

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setScrollLeft(containerRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll-fast multiplier
    containerRef.current.scrollLeft = scrollLeft - walk;
  };

  // Calculate date range
  const dateRangeForDisplay = useMemo(() => {
    const start = dateRange?.from || startOfMonth(new Date());
    const end = dateRange?.to || endOfMonth(new Date());
    return { start, end };
  }, [dateRange]);

  // Get all dates in range
  const dates = useMemo(() => {
    return eachDayOfInterval({ start: dateRangeForDisplay.start, end: dateRangeForDisplay.end });
  }, [dateRangeForDisplay]);

  // Transform attendance logs into user-date grid
  const userAttendanceMap = useMemo(() => {
    const map = new Map<string, UserAttendance>();

    // First, process attendance logs to build the attendance data
    attendance.forEach((log) => {
      const logDate = new Date(log.timestamp);
      const dateKey = getDeviceDateKey(logDate); // Use UTC to group by actual stored date

      if (!map.has(log.userId)) {
        map.set(log.userId, {
          userId: log.userId,
          name: log.odoo_name || `User ${log.userId}`,
          days: new Map()
        });
      }

      const userAtt = map.get(log.userId)!;
      if (!userAtt.days.has(dateKey)) {
        userAtt.days.set(dateKey, {
          date: logDate,
          hasAttendance: false,
          logs: []
        });
      }

      const dayAtt = userAtt.days.get(dateKey)!;
      dayAtt.hasAttendance = true;
      // Always add the log - ensure all logs are included
      if (!dayAtt.logs.some(existing => existing.getTime() === logDate.getTime())) {
        dayAtt.logs.push(logDate);
      }
      dayAtt.logs.sort((a, b) => a.getTime() - b.getTime());

      if (log.state === 0) {
        // Check-in
        if (!dayAtt.checkIn || logDate < dayAtt.checkIn) {
          dayAtt.checkIn = logDate;
        }
      } else {
        // Check-out
        if (!dayAtt.checkOut || logDate > dayAtt.checkOut) {
          dayAtt.checkOut = logDate;
        }
      }
    });

    // If showAllUsers is true, add all users (even without attendance)
    if (showAllUsers && allUsers.length > 0) {
      allUsers.forEach((user) => {
        if (!map.has(user.userId)) {
          map.set(user.userId, {
            userId: user.userId,
            name: user.name || user.odoo_name || `User ${user.userId}`,
            days: new Map()
          });
        } else {
          // Update name from user data if available
          const existing = map.get(user.userId)!;
          if (user.name && !existing.name.includes('User')) {
            existing.name = user.name;
          }
        }
      });
    }

    return Array.from(map.values());
  }, [attendance, allUsers, showAllUsers]);

  // Filter users based on search term
  const filteredUserAttendanceMap = useMemo(() => {
    let list = userAttendanceMap;

    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      list = list.filter((user) => {
        const nameMatch = user.name.toLowerCase().includes(searchLower);
        const userIdMatch = user.userId.toLowerCase().includes(searchLower);
        return nameMatch || userIdMatch;
      });
    }

    // Default sort by employee code (userId)
    return [...list].sort((a, b) => a.userId.localeCompare(b.userId));
  }, [userAttendanceMap, searchTerm]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredUserAttendanceMap.length / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedUsers = useMemo(() => {
    return filteredUserAttendanceMap.slice(startIndex, endIndex);
  }, [filteredUserAttendanceMap, startIndex, endIndex]);

  // Reset to page 1 when date range or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [dateRange, searchTerm]);

  // Handle date range selection with one month limit
  const handleDateRangeSelect = (range: DateRange | undefined) => {
    if (!range) {
      setDateRange(range);
      return;
    }

    let adjustedRange: DateRange | undefined = range;

    // If both dates are selected
    if (range.from && range.to) {
      // Check if it's a single date selection (same day)
      if (isSameDay(range.from, range.to)) {
        // Single date selected - set to start and end of that day
        const start = startOfDay(range.from);
        const end = endOfDay(range.from);
        adjustedRange = {
          from: start,
          to: end
        };
      } else {
        // Date range selected - check if it exceeds one month
        const daysDiff = differenceInDays(range.to, range.from);
        const maxDays = 30; // Maximum days in a month (0-indexed: 0-30 = 31 days total)

        if (daysDiff > maxDays) {
          // Limit to exactly one month from start date
          const maxEndDate = addMonths(range.from, 1);
          adjustedRange = {
            from: range.from,
            to: maxEndDate
          };
        }
      }
    } else if (range.from && !range.to) {
      // If only start date is selected, set to start and end of that same day
      const start = startOfDay(range.from);
      const end = endOfDay(range.from);
      adjustedRange = {
        from: start,
        to: end
      };
    }

    setDateRange(adjustedRange);

    if (adjustedRange?.from && adjustedRange?.to && onDateRangeChange) {
      onDateRangeChange(adjustedRange.from, adjustedRange.to);
    }
  };

  // Trigger initial date range fetch
  useEffect(() => {
    if (dateRange?.from && dateRange?.to && onDateRangeChange) {
      onDateRangeChange(dateRange.from, dateRange.to);
    }
  }, []); // Only run on mount

  // Format time for display (using UTC to show exact device time)
  const formatTime = (date: Date) => {
    return formatDeviceTime12(date);
  };

  // Calculate hours worked
  const calculateHours = (checkIn: Date, checkOut: Date) => {
    const diff = checkOut.getTime() - checkIn.getTime();
    const hours = diff / (1000 * 60 * 60);
    return hours.toFixed(1);
  };

  // Export attendance as CSV matching the table structure and current date range
  const handleExport = () => {
    // Build a user map that always includes all users, regardless of UI toggle
    const exportMap = new Map<string, UserAttendance>();
    
    // Create a lookup map for user details (department, designation) from allUsers
    const userDetailsMap = new Map<string, { department: string | null; designation: string | null }>();
    allUsers.forEach((user) => {
      userDetailsMap.set(user.userId, {
        department: user.designationDepartment || null,
        designation: user.designation || null,
      });
    });

    // Start with the current attendance-based map
    userAttendanceMap.forEach((value) => {
      exportMap.set(value.userId, {
        userId: value.userId,
        name: value.name,
        days: new Map(value.days),
      });
    });

    // Ensure all known users are present
    allUsers.forEach((user) => {
      if (!exportMap.has(user.userId)) {
        exportMap.set(user.userId, {
          userId: user.userId,
          name: user.name || user.odoo_name || `User ${user.userId}`,
          days: new Map(),
        });
      } else {
        // Update name if we have a better one
        const existing = exportMap.get(user.userId)!;
        if (user.name && existing.name.includes('User')) {
          existing.name = user.name;
        }
      }
    });

    const usersForExport = Array.from(exportMap.values());
    if (usersForExport.length === 0 || dates.length === 0) {
      return;
    }

    const escapeCsv = (value: string | number | null | undefined) =>
      `"${(value ?? '').toString().replace(/"/g, '""')}"`;

    // Header: SL No, Employee Code, Name, Department, Designation, one column per date, Total Days
    const headers: string[] = [
      'SL No',
      'Employee Code',
      'Name',
      'Department',
      'Designation',
      ...dates.map((date) => format(date, 'yyyy-MM-dd')),
      'Total Days',
    ];

    const rows: string[] = [];

    usersForExport
      // Sort by employee code (userId) for export as well
      .sort((a, b) => a.userId.localeCompare(b.userId))
      .forEach((user, index) => {
        let totalDays = 0;
        
        // Get user details (department and designation)
        const userDetails = userDetailsMap.get(user.userId) || { department: null, designation: null };

        const dayValues = dates.map((date) => {
          // Convert grid date (local calendar date) to UTC dateKey for matching
          // Create a date at midnight UTC for this calendar date to get the UTC dateKey
          const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
          const dateKey = getDeviceDateKey(utcDate);
          const dayAtt = user.days.get(dateKey);
          const hasAttendance = !!dayAtt?.hasAttendance;

          if (hasAttendance) totalDays++;

          if (!dayAtt || !hasAttendance) {
            return '';
          }

          // Build a human-readable summary showing all records (same as display)
          if (dayAtt.logs.length > 0) {
            // Show all logs with their times, matching the display format
            const times = dayAtt.logs.map((logTime) => formatDeviceTime(logTime));
            let summary = times.join(' / ');
            
            // Add hours worked if both check-in and check-out exist
            if (dayAtt.checkIn && dayAtt.checkOut) {
              summary += ` (${calculateHours(dayAtt.checkIn, dayAtt.checkOut)}h)`;
            }
            
            return summary;
          }

          return '';
        });

        const row = [
          escapeCsv(index + 1),
          escapeCsv(user.userId),
          escapeCsv(user.name),
          escapeCsv(userDetails.department),
          escapeCsv(userDetails.designation),
          ...dayValues.map(escapeCsv),
          escapeCsv(totalDays),
        ].join(',');

        rows.push(row);
      });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_book_${new Date().toISOString().slice(0, 16).replace(/:/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-3 items-center flex-wrap">
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
            />
          </div>

          <Popover
            trigger={
              <button className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 hover:bg-secondary border border-border rounded-lg text-sm font-medium transition-all">
                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                <span>
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')}
                      </>
                    ) : (
                      format(dateRange.from, 'MMM dd, yyyy')
                    )
                  ) : (
                    'Select date range'
                  )}
                </span>
              </button>
            }
            position="bottom"
            align="start"
            className="z-50 w-auto !max-w-none"
          >
            <Calendar
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={handleDateRangeSelect}
              numberOfMonths={2}
              className="rounded-lg border-none"
              disabled={(date) => {
                if (!dateRange?.from) return false;
                // Disable dates more than one month from the start date
                const maxDate = addMonths(dateRange.from, 1);
                return date > maxDate;
              }}
            />
          </Popover>

          {/* Toggle for showing all users */}
          <button
            onClick={() => {
              setShowAllUsers(!showAllUsers);
              setCurrentPage(1); // Reset to first page when toggling
            }}
            className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm font-medium transition-all ${showAllUsers
                ? 'bg-accent text-white border-accent'
                : 'bg-secondary/50 hover:bg-secondary border-border text-foreground'
              }`}
          >
            <Users className="w-4 h-4" />
            <span>{showAllUsers ? 'All Users' : 'With Attendance'}</span>
          </button>
        </div>
        <button
          onClick={handleExport}
          disabled={userAttendanceMap.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-secondary/50 hover:bg-secondary border border-border rounded-lg text-xs font-medium transition-all disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {/* Attendance Book Grid */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div
          ref={containerRef}
          className="overflow-x-auto overflow-y-auto cursor-grab active:cursor-grabbing select-none"
          style={{ maxHeight: 'calc(100vh - 280px)', minHeight: '400px' }}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
        >
          <div style={{ width: `${70 + 120 + 230 + (dates.length * 150) + 70}px`, minWidth: '100%' }}>
            <table className="data-table" style={{ width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '70px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '230px' }} />
                {dates.map(() => (
                  <col key={Math.random()} style={{ width: '150px' }} />
                ))}
                <col style={{ width: '70px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th
                    className="shadow-[1px_0_0_0_var(--border)] text-center"
                    style={{
                      position: 'sticky',
                      left: 0,
                      top: 0,
                      zIndex: 50,
                      minWidth: '70px',
                      width: '70px',
                      backgroundColor: 'var(--card)'
                    }}
                  >
                    <div className="flex items-center justify-center gap-2">
                      SL No
                    </div>
                  </th>
                  <th
                    className="shadow-[1px_0_0_0_var(--border)]"
                    style={{
                      position: 'sticky',
                      left: 70,
                      top: 0,
                      zIndex: 50,
                      minWidth: '120px',
                      width: '120px',
                      backgroundColor: 'var(--card)'
                    }}
                  >
                    <div className="flex items-center gap-2">
                      Employee Code
                    </div>
                  </th>
                  <th
                    className="shadow-[1px_0_0_0_var(--border)]"
                    style={{
                      position: 'sticky',
                      left: 70 + 120,
                      top: 0,
                      zIndex: 50,
                      minWidth: '230px',
                      width: '230px',
                      backgroundColor: 'var(--card)'
                    }}
                  >
                    <div className="flex items-center gap-2">
                      Name
                    </div>
                  </th>
                  {dates.map((date, index) => (
                    <th
                      key={index}
                      className="text-center"
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 40,
                        minWidth: '150px',
                        width: '150px',
                        backgroundColor: 'var(--card)'
                      }}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-medium">{format(date, 'EEE')}</span>
                        <span className="text-xs text-muted-foreground">{format(date, 'dd')}</span>
                      </div>
                    </th>
                  ))}
                  <th
                    className="shadow-[-1px_0_0_0_var(--border)] text-center"
                    style={{
                      position: 'sticky',
                      right: 0,
                      top: 0,
                      zIndex: 50,
                      minWidth: '70px',
                      width: '70px',
                      backgroundColor: 'var(--card)'
                    }}
                  >
                    Total Days
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={dates.length + 3} className="text-center py-12 text-muted-foreground">
                      Loading...
                    </td>
                  </tr>
                ) : paginatedUsers.length > 0 ? (
                  paginatedUsers.map((userAtt, rowIndex) => {
                    let totalDays = 0;
                    const serialNumber = startIndex + rowIndex + 1;

                    return (
                      <tr key={userAtt.userId}>
                        {/* Serial Number - Sticky */}
                        <td
                          className="bg-card shadow-[1px_0_0_0_var(--border)] text-center"
                          style={{
                            position: 'sticky',
                            left: 0,
                            zIndex: 30,
                            minWidth: '70px',
                            width: '70px'
                          }}
                        >
                          <div className="text-sm font-medium text-muted-foreground">
                            {serialNumber}
                          </div>
                        </td>
                        {/* Employee Code - Sticky */}
                        <td
                          className="bg-card shadow-[1px_0_0_0_var(--border)]"
                          style={{
                            position: 'sticky',
                            left: 70,
                            zIndex: 30,
                            minWidth: '120px',
                            width: '120px'
                          }}
                        >
                          <div className="text-sm font-mono text-muted-foreground truncate">
                            {userAtt.userId}
                          </div>
                        </td>
                        {/* User Name - Sticky */}
                        <td
                          className="bg-card shadow-[1px_0_0_0_var(--border)]"
                          style={{
                            position: 'sticky',
                            left: 70 + 120,
                            zIndex: 30,
                            minWidth: '230px',
                            width: '230px'
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent/20 to-accent/30 flex items-center justify-center text-accent font-semibold text-sm flex-shrink-0">
                              {userAtt.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{userAtt.name}</div>
                            </div>
                          </div>
                        </td>

                        {/* Date Cells */}
                        {dates.map((date, dateIndex) => {
                          // Convert grid date (local calendar date) to UTC dateKey for matching
                          // Create a date at midnight UTC for this calendar date to get the UTC dateKey
                          const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
                          const dateKey = getDeviceDateKey(utcDate);
                          const dayAtt = userAtt.days.get(dateKey);
                          const hasAttendance = dayAtt?.hasAttendance || false;

                          if (hasAttendance) totalDays++;

                          // Check if attendance is partial (only check-in or only check-out)
                          const hasCheckIn = Boolean(dayAtt?.checkIn);
                          const hasCheckOut = Boolean(dayAtt?.checkOut);
                          const isPartial = hasAttendance && dayAtt && hasCheckIn !== hasCheckOut;
                          const isComplete = hasAttendance && dayAtt && hasCheckIn && hasCheckOut;
                          const hasMultipleRecords = hasAttendance && dayAtt && dayAtt.logs.length > 2;

                          // Determine background color
                          let bgStyle: React.CSSProperties = { minWidth: '150px', width: '150px' };

                          if (hasMultipleRecords) {
                            bgStyle.backgroundColor = 'rgba(249, 115, 22, 0.2)'; // orange-500/20 for duplicates
                          } else if (isComplete) {
                            bgStyle.backgroundColor = 'rgba(16, 185, 129, 0.05)'; // accent/5
                          } else if (isPartial) {
                            bgStyle.backgroundColor = 'rgba(245, 158, 11, 0.15)'; // warning/15
                          }

                          return (
                            <td
                              key={dateIndex}
                              className="text-center"
                              style={bgStyle}
                            >
                              {hasAttendance && dayAtt ? (
                                <div className="flex flex-col gap-1 py-2">
                                  {/* Always show all records from logs array */}
                                  {dayAtt.logs.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                      {dayAtt.logs.map((logTime, idx) => (
                                        <div key={idx} className="text-xs">
                                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${idx === 0 || idx === dayAtt.logs.length - 1
                                              ? 'bg-accent/10 text-accent'
                                              : 'bg-orange-500/20 text-orange-600'
                                            }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${idx === 0 || idx === dayAtt.logs.length - 1
                                                ? 'bg-accent'
                                                : 'bg-orange-600'
                                              }`} />
                                            {formatTime(logTime)}
                                          </span>
                                        </div>
                                      ))}
                                      {dayAtt.checkIn && dayAtt.checkOut && (
                                        <div className="text-xs text-muted-foreground mt-0.5 border-t border-orange-500/20 pt-1">
                                          {calculateHours(dayAtt.checkIn, dayAtt.checkOut)}h
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-muted-foreground/30 text-xs py-2">-</div>
                              )}
                            </td>
                          );
                        })}

                        {/* Total Days */}
                        <td
                          className="bg-card shadow-[-1px_0_0_0_var(--border)] text-center font-medium"
                          style={{
                            position: 'sticky',
                            right: 0,
                            zIndex: 30,
                            minWidth: '70px',
                            width: '70px'
                          }}
                        >
                          {totalDays}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={dates.length + 3} className="text-center py-12 text-muted-foreground">
                      No attendance records found for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {filteredUserAttendanceMap.length > 0 && (
          <div className="px-6 py-3 border-t border-border/50 flex items-center justify-between bg-card/80 backdrop-blur-sm">
            <span className="text-sm text-muted-foreground">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredUserAttendanceMap.length)} of {filteredUserAttendanceMap.length.toLocaleString()} employees
              {searchTerm && ` (filtered from ${userAttendanceMap.length.toLocaleString()})`}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1 || isLoading}
                  className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium px-3">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages || isLoading}
                  className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}





