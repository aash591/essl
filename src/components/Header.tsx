import React from 'react';
import { Cpu, Users, Database } from 'lucide-react';
import { Device } from '@/types';

interface HeaderProps {
  isConnected: boolean;
  selectedDevice: Device | null;
  dbStats: {
    totalUsers: number;
    totalLogs: number;
  };
}

export default function Header({ isConnected, selectedDevice, dbStats }: HeaderProps) {
  return (
    <header className="h-16 border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50 flex-shrink-0">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">ESSL Dashboard</h1>
            <p className="text-xs text-muted-foreground">Biometric Access Control</p>
          </div>
        </div>

        {/* Right side - Quick stats and connection */}
        <div className="flex items-center gap-6">
          {/* Quick stats */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>{dbStats.totalUsers.toLocaleString()} users</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Database className="w-4 h-4" />
              <span>{dbStats.totalLogs.toLocaleString()} logs</span>
            </div>
          </div>

          {/* Connection Status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${isConnected
              ? 'bg-accent/10 text-accent border border-accent/20'
              : 'bg-secondary text-muted-foreground border border-border'
            }`}>
            <span className={`status-dot ${isConnected ? 'online' : 'offline'}`} />
            {isConnected ? (selectedDevice?.name || 'Connected') : 'Disconnected'}
          </div>
        </div>
      </div>
    </header>
  );
}

