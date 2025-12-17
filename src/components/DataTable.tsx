import React from 'react';
import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  render?: (item: T, index: number) => React.ReactNode;
  sortable?: boolean;
  sortField?: string; // Field name for sorting if different from accessorKey
  width?: string;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T | ((item: T) => string | number);
  isLoading?: boolean;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
  };
  sorting?: {
    field: string | null;
    direction: 'asc' | 'desc';
    onSort: (field: string) => void;
  };
  emptyMessage?: string;
  stickyHeader?: boolean;
  stickyFooter?: boolean;
  height?: string;
  minHeight?: string;
}

export default function DataTable<T>({
  columns,
  data,
  keyField,
  isLoading = false,
  pagination,
  sorting,
  emptyMessage = 'No records found',
  stickyHeader = true,
  stickyFooter = true,
  height,
  minHeight
}: DataTableProps<T>) {

  const getSortIcon = (field: string) => {
    if (!sorting || sorting.field !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    }
    return sorting.direction === 'asc'
      ? <ArrowUp className="w-3 h-3 text-primary" />
      : <ArrowDown className="w-3 h-3 text-primary" />;
  };

  // Calculate display range
  const startRecord = pagination ? (pagination.currentPage - 1) * pagination.pageSize + 1 : 0;
  const endRecord = pagination ? Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems) : 0;

  return (
    <div 
      className="glass-card rounded-xl overflow-hidden flex flex-col" 
      style={{ height: height, minHeight: minHeight }}
    >
      {/* Scrollable Table with Sticky Header */}
      <div className="overflow-y-auto overflow-x-auto flex-1">
        <table className="data-table">
          <thead className={stickyHeader ? 'sticky top-0 z-20 border-b border-border/50 bg-card/80 backdrop-blur-sm' : ''}>
            <tr>
              {columns.map((col, index) => {
                const sortField = col.sortField || (typeof col.accessorKey === 'string' ? col.accessorKey : undefined);
                const isSortable = col.sortable && sortField && sorting;

                return (
                  <th
                    key={index}
                    style={{ width: col.width }}
                    className={`${col.className || ''} ${isSortable ? 'cursor-pointer hover:bg-secondary/50 transition-colors select-none' : ''}`}
                    onClick={isSortable ? () => sorting.onSort(sortField as string) : undefined}
                  >
                    <div className="flex items-center gap-2">
                      {col.header}
                      {isSortable && getSortIcon(sortField as string)}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-12 text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : data.length > 0 ? (
              data.map((item, rowIndex) => {
                const key = typeof keyField === 'function' ? keyField(item) : item[keyField] as string | number;
                return (
                  <tr key={key}>
                    {columns.map((col, colIndex) => (
                      <td key={colIndex} className={col.className} style={{ width: col.width }}>
                        {col.render 
                          ? col.render(item, rowIndex) 
                          : (col.accessorKey ? String(item[col.accessorKey]) : '')}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={columns.length} className="text-center py-12 text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sticky Footer (Pagination) */}
      {pagination && data.length > 0 && (
        <div className={`px-6 py-3 border-t border-border/50 flex items-center justify-between flex-shrink-0 ${stickyFooter ? 'bg-card/80 backdrop-blur-sm' : ''}`}>
          <span className="text-sm text-muted-foreground">
            Showing {startRecord}-{endRecord} of {pagination.totalItems.toLocaleString()} records
          </span>
          {pagination.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => pagination.onPageChange(Math.max(1, pagination.currentPage - 1))}
                disabled={pagination.currentPage === 1 || isLoading}
                className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium px-3">
                Page {pagination.currentPage} of {pagination.totalPages}
              </span>
              <button
                onClick={() => pagination.onPageChange(Math.min(pagination.totalPages, pagination.currentPage + 1))}
                disabled={pagination.currentPage === pagination.totalPages || isLoading}
                className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

