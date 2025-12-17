import React from 'react';
import { 
  HelpCircle, 
  Users, 
  Clock, 
  Server, 
  Settings, 
  LayoutDashboard,
  Fingerprint,
  RefreshCw,
  Download,
  Search,
  Filter,
  BookOpen,
  MessageCircle,
  ArrowRight,
  Instagram
} from 'lucide-react';

export default function HelpTab() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="glass-card p-6 rounded-lg border border-border/50">
        <div className="flex items-center gap-3 mb-2">
          <HelpCircle className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-bold">Help & Documentation</h1>
        </div>
        <p className="text-muted-foreground">
          Welcome to the ESSL Biometric Access Control System. This guide will help you navigate and use all features effectively.
        </p>
      </div>

      {/* Quick Start Guide */}
      <section className="glass-card p-6 rounded-lg border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Quick Start Guide</h2>
        </div>
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
              1
            </div>
            <div>
              <h3 className="font-medium mb-1">Connect to a Device</h3>
              <p className="text-sm text-muted-foreground">
                Go to the <strong>Devices</strong> tab and register your biometric device by providing the IP address, port, and credentials.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
              2
            </div>
            <div>
              <h3 className="font-medium mb-1">Sync Users and Data</h3>
              <p className="text-sm text-muted-foreground">
                Select a device and click <strong>Sync to Database</strong> to transfer all users, attendance logs, and fingerprint data.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
              3
            </div>
            <div>
              <h3 className="font-medium mb-1">Manage Your Data</h3>
              <p className="text-sm text-muted-foreground">
                Use the <strong>Users</strong> and <strong>Attendance</strong> tabs to view, search, and manage your data.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
              4
            </div>
            <div>
              <h3 className="font-medium mb-1">Configure Settings</h3>
              <p className="text-sm text-muted-foreground">
                Set up departments, designations, and shifts in the <strong>Settings</strong> tab to organize your workforce.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Overview */}
      <section className="glass-card p-6 rounded-lg border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <LayoutDashboard className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Feature Overview</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-secondary/50 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <LayoutDashboard className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Dashboard</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              View system overview, statistics, recent check-ins/check-outs, and device information at a glance.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-secondary/50 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Users</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Manage registered users, assign designations and shifts, add fingerprint templates, and export user data.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-secondary/50 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Attendance</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              View attendance records, filter by date range or user, search entries, and analyze attendance patterns.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-secondary/50 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Devices</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Connect to biometric devices, sync data, manage multiple devices, view device information, and configure device settings.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-secondary/50 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Settings</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Configure departments, designations, and shifts to organize your workforce structure.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-secondary/50 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Fingerprint className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Fingerprint Management</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Add, delete, and sync fingerprint templates between devices and the database for biometric authentication.
            </p>
          </div>
        </div>
      </section>

      {/* Common Tasks */}
      <section className="glass-card p-6 rounded-lg border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Common Tasks</h2>
        </div>
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-secondary/50 border border-border/30">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <ArrowRight className="w-4 h-4" />
              How to Add a New User
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-6">
              <li>Navigate to the <strong>Users</strong> tab</li>
              <li>Click the <strong>Add User</strong> button</li>
              <li>Fill in the user details (User ID, Name, Role, etc.)</li>
              <li>Optionally assign a designation and shift</li>
              <li>Click <strong>Save</strong> to add the user</li>
            </ol>
          </div>

          <div className="p-4 rounded-lg bg-secondary/50 border border-border/30">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <ArrowRight className="w-4 h-4" />
              How to Sync Data from Device
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-6">
              <li>Go to the <strong>Devices</strong> tab</li>
              <li>Select a registered device from the list</li>
              <li>Click <strong>Connect</strong> to establish connection</li>
              <li>Click <strong>Sync to Database</strong> to transfer all data</li>
              <li>Wait for the sync process to complete</li>
            </ol>
          </div>

          <div className="p-4 rounded-lg bg-secondary/50 border border-border/30">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <ArrowRight className="w-4 h-4" />
              How to Search and Filter Attendance
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-6">
              <li>Navigate to the <strong>Attendance</strong> tab</li>
              <li>Use the search bar to find specific users or entries</li>
              <li>Use date filters to view attendance for specific periods</li>
              <li>Filter by check-in/check-out status using the filter buttons</li>
              <li>Sort columns by clicking on column headers</li>
            </ol>
          </div>

          <div className="p-4 rounded-lg bg-secondary/50 border border-border/30">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <ArrowRight className="w-4 h-4" />
              How to Configure Departments and Designations
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-6">
              <li>Go to the <strong>Settings</strong> tab</li>
              <li>Click on the <strong>Departments</strong> section</li>
              <li>Add or edit departments as needed</li>
              <li>Switch to <strong>Designations</strong> section</li>
              <li>Assign designations to departments</li>
            </ol>
          </div>
        </div>
      </section>

      {/* Tips & Best Practices */}
      <section className="glass-card p-6 rounded-lg border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Tips & Best Practices</h2>
        </div>
        <div className="space-y-3">
          <div className="flex gap-3">
            <RefreshCw className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium mb-1">Regular Syncs</h3>
              <p className="text-sm text-muted-foreground">
                Sync your devices regularly to keep your database up-to-date with the latest attendance records.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Users className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium mb-1">Organize Users</h3>
              <p className="text-sm text-muted-foreground">
                Assign designations and shifts to users for better organization and reporting capabilities.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Fingerprint className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium mb-1">Fingerprint Templates</h3>
              <p className="text-sm text-muted-foreground">
                Ensure users have multiple fingerprint templates registered for better recognition accuracy.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Download className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium mb-1">Export Data</h3>
              <p className="text-sm text-muted-foreground">
                Regularly export user and attendance data as backups or for external analysis.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section className="glass-card p-6 rounded-lg border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Keyboard Shortcuts</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="flex justify-between items-center p-3 rounded-lg bg-secondary/50 border border-border/30">
            <span className="text-sm">Search</span>
            <kbd className="px-2 py-1 text-xs font-semibold rounded bg-background border border-border">Ctrl + F</kbd>
          </div>
          <div className="flex justify-between items-center p-3 rounded-lg bg-secondary/50 border border-border/30">
            <span className="text-sm">Refresh Data</span>
            <kbd className="px-2 py-1 text-xs font-semibold rounded bg-background border border-border">F5</kbd>
          </div>
        </div>
      </section>

      {/* Support */}
      <section className="glass-card p-6 rounded-lg border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Need More Help?</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          If you need additional assistance or encounter any issues, please contact your system administrator or refer to the device manufacturer's documentation.
        </p>
        <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
          <p className="text-sm">
            <strong>Note:</strong> Ensure your devices are properly connected to the network and have valid credentials before attempting to sync data.
          </p>
        </div>
      </section>

      {/* Footer / Credits */}
      <footer className="mt-8 pt-6 border-t border-border/50">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span>© 2025</span>
          <a
            href="https://www.instagram.com/aash591_/reels/?__d=11"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors hover:underline"
          >
            <Instagram className="w-4 h-4" />
            <span className="font-medium">aash591</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
