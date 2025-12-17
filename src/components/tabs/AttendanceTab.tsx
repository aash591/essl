import React, { useState, useEffect } from 'react';
import { AttendanceLog, User } from '@/types';
import AttendanceBook from '@/components/AttendanceBook';

interface AttendanceTabProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterState: 'all' | 'check-in' | 'check-out';
  setFilterState: (state: 'all' | 'check-in' | 'check-out') => void;
  attendancePage: number;
  setAttendancePage: (page: number) => void;
  attendanceTotalPages: number;
  dbStats: { totalLogs: number };
  dbAttendance: AttendanceLog[];
  isLoading: boolean;
  PAGE_SIZE: number;
  attendanceSortField: string | null;
  attendanceSortDirection: 'asc' | 'desc';
  handleAttendanceSort: (field: string) => void;
  fetchDbAttendance: (page: number, search: string, state?: string) => Promise<void>;
  fetchDbAttendanceByDateRange: (startDate: Date, endDate: Date) => Promise<AttendanceLog[]>;
  fetchAllUsers: () => Promise<User[]>;
}

export default function AttendanceTab({
  searchTerm,
  setSearchTerm,
  filterState,
  setFilterState,
  attendancePage,
  setAttendancePage,
  attendanceTotalPages,
  dbStats,
  dbAttendance,
  isLoading,
  PAGE_SIZE,
  attendanceSortField,
  attendanceSortDirection,
  handleAttendanceSort,
  fetchDbAttendance,
  fetchDbAttendanceByDateRange,
  fetchAllUsers
}: AttendanceTabProps) {
  const [attendanceForBook, setAttendanceForBook] = useState<AttendanceLog[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoadingBook, setIsLoadingBook] = useState(false);

  // Fetch all users on mount
  useEffect(() => {
    fetchAllUsers().then(setAllUsers);
  }, [fetchAllUsers]);

  // Handle date range change
  const handleDateRangeChange = async (startDate: Date, endDate: Date) => {
    setIsLoadingBook(true);
    try {
      const logs = await fetchDbAttendanceByDateRange(startDate, endDate);
      setAttendanceForBook(logs);
    } catch (error) {
      console.error('Error fetching attendance by date range:', error);
    } finally {
      setIsLoadingBook(false);
    }
  };

  return (
    <AttendanceBook
      attendance={attendanceForBook}
      allUsers={allUsers}
      isLoading={isLoading || isLoadingBook}
      onDateRangeChange={handleDateRangeChange}
    />
  );
}

