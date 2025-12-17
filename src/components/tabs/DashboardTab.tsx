import React from 'react';
import { Activity, Clock, Server, Users, Database } from 'lucide-react';
import { format } from 'date-fns';
import { DeviceInfo, AttendanceLog, Device } from '@/types';
import StatCard from '@/components/StatCard';
import InfoItem from '@/components/InfoItem';
import DataTable, { Column } from '@/components/DataTable';
import { formatDeviceDateTime, formatDeviceTimestamp } from '@/lib/utils';

interface DashboardTabProps {
  dbStats: { totalUsers: number; totalLogs: number };
  checkIns: number;
  checkOuts: number;
  deviceInfo: (DeviceInfo & { deviceTime?: string }) | null;
  selectedDevice: Device | null;
  dbAttendance: AttendanceLog[];
}

const recentActivityColumns: Column<AttendanceLog>[] = [
  { header: 'User ID', accessorKey: 'userId', className: 'font-mono text-primary' },
  { header: 'Name', render: (log) => log.odoo_name || `User ${log.userId}` },
  { header: 'Time', render: (log) => formatDeviceDateTime(new Date(log.timestamp)), className: 'text-muted-foreground' },
  { header: 'Status', render: (log) => (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${log.state === 0
        ? 'bg-accent/10 text-accent'
        : 'bg-warning/10 text-warning'
      }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${log.state === 0 ? 'bg-accent' : 'bg-warning'}`} />
      {log.stateLabel}
    </span>
  )}
];

export default function DashboardTab({ dbStats, checkIns, checkOuts, deviceInfo, selectedDevice, dbAttendance }: DashboardTabProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users className="w-5 h-5" />} label="Total Users" value={dbStats.totalUsers} color="primary" />
        <StatCard icon={<Database className="w-5 h-5" />} label="Total Logs" value={dbStats.totalLogs} color="accent" />
        <StatCard icon={<Activity className="w-5 h-5" />} label="Today Check-ins" value={checkIns} color="warning" />
        <StatCard icon={<Clock className="w-5 h-5" />} label="Today Check-outs" value={checkOuts} color="info" />
      </div>

      {deviceInfo && (
        <div className="glass-card rounded-xl p-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <Server className="w-4 h-4" /> Device Information
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
            <InfoItem label="Serial Number" value={deviceInfo.serialNumber} />
            <InfoItem label="Device Name" value={deviceInfo.deviceName} />
            <InfoItem label="Device Model" value={selectedDevice?.deviceModel || 'N/A'} />
            <InfoItem label="Platform" value={deviceInfo.platform} />
            <InfoItem label="Firmware" value={deviceInfo.firmware} />
            <InfoItem label="IP Address" value={deviceInfo.ip} />
            <InfoItem label="Device Time" value={deviceInfo.deviceTime ? formatDeviceTimestamp(new Date(deviceInfo.deviceTime), 'MMM dd, HH:mm:ss') : 'N/A'} />
          </div>
        </div>
      )}

      {dbAttendance.length > 0 && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border/50">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4" /> Recent Activity
            </h3>
          </div>
          <DataTable 
            columns={recentActivityColumns} 
            data={dbAttendance.slice(0, 5)} 
            keyField="id" 
            stickyHeader={false} 
            stickyFooter={false}
          />
        </div>
      )}
    </div>
  );
}

