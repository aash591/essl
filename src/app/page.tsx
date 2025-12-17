'use client';

import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PageHeader from '@/components/PageHeader';
import Notification from '@/components/Notification';
import ConfirmationModal from '@/components/ConfirmationModal';
import DashboardTab from '@/components/tabs/DashboardTab';
import AttendanceTab from '@/components/tabs/AttendanceTab';
import UsersTab from '@/components/tabs/UsersTab';
import DeviceTab from '@/components/tabs/DeviceTab';
import SettingsTab from '@/components/tabs/SettingsTab';
import HelpTab from '@/components/tabs/HelpTab';
import { useDashboard } from '@/hooks/useDashboard';

type TabType = 'dashboard' | 'attendance' | 'users' | 'device' | 'settings' | 'help';

  const tabLabels: Record<TabType, string> = {
    dashboard: 'Dashboard',
    attendance: 'Attendance',
    users: 'Users',
    device: 'Devices',
    settings: 'Settings',
    help: 'Help',
  };

export default function ESSLDashboard() {
  const dashboard = useDashboard();

  return (
    <div className="h-screen overflow-hidden noise-overlay flex flex-col">
      {dashboard.notification && (
        <Notification
          type={dashboard.notification.type}
          message={dashboard.notification.message}
          onClose={() => dashboard.setNotification(null)}
          autoClose={dashboard.notification.autoClose === true}
        />
      )}

      <ConfirmationModal
        show={dashboard.showSyncUsersConfirmation || false}
        onClose={() => {
          dashboard.setShowSyncUsersConfirmation(false);
          if (dashboard.setPendingSyncAction) {
            dashboard.setPendingSyncAction(null);
          }
        }}
        onConfirm={dashboard.confirmSyncUsersOnly || (() => {})}
        title="Sync Users Only"
        message={
          dashboard.pendingSyncAction === 'all'
            ? `This will sync users from all ${dashboard.devices.length} registered device(s).\n\n⚠️ This will sync    :\n• users on each device\n• fingerprint templates per user \n\nDo you want to continue?`
            : `This will sync users from the connected device.\n\n⚠️ This operation may take significant time depending on:\n• Number of users on the device\n• Number of fingerprint templates per user\n• Network speed\n\nDo you want to continue?`
        }
        confirmText="Start Sync"
        cancelText="Cancel"
        type="warning"
      />

      <Header 
        isConnected={dashboard.isConnected || dashboard.isSyncingAll} 
        selectedDevice={dashboard.isSyncingAll && dashboard.syncAllProgress?.deviceName 
          ? { ...(dashboard.selectedDevice || {}), name: dashboard.syncAllProgress.deviceName } as any
          : dashboard.selectedDevice} 
        dbStats={dashboard.dbStats} 
      />

      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar 
          activeTab={dashboard.activeTab} 
          onTabChange={dashboard.setActiveTab}
          isCollapsed={dashboard.isSidebarCollapsed}
          onCollapseChange={dashboard.setIsSidebarCollapsed}
        />

        <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${dashboard.isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
          <PageHeader
            title={tabLabels[dashboard.activeTab]}
            description={
              dashboard.activeTab === 'dashboard' ? 'Overview of your attendance system' :
              dashboard.activeTab === 'attendance' ? 'View and manage attendance records' :
              dashboard.activeTab === 'users' ? 'Manage registered users' :
              dashboard.activeTab === 'device' ? 'Configure and sync devices' :
              dashboard.activeTab === 'help' ? 'Help & Documentation' :
              'Manage departments, designations, and system settings'
            }
          />
          <main className="flex-1 overflow-auto">
            <div className="p-6">
            {dashboard.activeTab === 'dashboard' && (
              <DashboardTab
                dbStats={dashboard.dbStats}
                checkIns={dashboard.checkIns}
                checkOuts={dashboard.checkOuts}
                deviceInfo={dashboard.deviceInfo}
                selectedDevice={dashboard.selectedDevice}
                dbAttendance={dashboard.dbAttendance}
              />
            )}

            {dashboard.activeTab === 'attendance' && (
              <AttendanceTab
                searchTerm={dashboard.searchTerm}
                setSearchTerm={dashboard.setSearchTerm}
                filterState={dashboard.filterState}
                setFilterState={dashboard.setFilterState}
                attendancePage={dashboard.attendancePage}
                setAttendancePage={dashboard.setAttendancePage}
                attendanceTotalPages={dashboard.attendanceTotalPages}
                dbStats={dashboard.dbStats}
                dbAttendance={dashboard.dbAttendance}
                isLoading={dashboard.isLoading}
                PAGE_SIZE={dashboard.PAGE_SIZE}
                attendanceSortField={dashboard.attendanceSortField}
                attendanceSortDirection={dashboard.attendanceSortDirection}
                handleAttendanceSort={dashboard.handleAttendanceSort}
                fetchDbAttendance={dashboard.fetchDbAttendance}
                fetchDbAttendanceByDateRange={dashboard.fetchDbAttendanceByDateRange}
                fetchAllUsers={dashboard.fetchAllUsers}
              />
            )}

            {dashboard.activeTab === 'users' && (
              <UsersTab
                searchTerm={dashboard.searchTerm}
                setSearchTerm={dashboard.setSearchTerm}
                usersPage={dashboard.usersPage}
                setUsersPage={dashboard.setUsersPage}
                usersTotalPages={dashboard.usersTotalPages}
                dbStats={dashboard.dbStats}
                sortedUsers={dashboard.sortedUsers}
                isLoading={dashboard.isLoading}
                PAGE_SIZE={dashboard.PAGE_SIZE}
                userSortField={dashboard.userSortField}
                userSortDirection={dashboard.userSortDirection}
                handleUserSort={dashboard.handleUserSort}
                fetchDbUsers={dashboard.fetchDbUsers}
                exportUsers={dashboard.exportUsers}
                selectedDevice={dashboard.selectedDevice}
                showNotification={dashboard.showNotification}
              />
            )}

            {dashboard.activeTab === 'device' && (
              <DeviceTab
                devices={dashboard.devices}
                selectedDevice={dashboard.selectedDevice}
                isLoadingDevices={dashboard.isLoadingDevices}
                isConnected={dashboard.isConnected}
                isConnecting={dashboard.isConnecting}
                isSyncing={dashboard.isSyncing}
                isSyncingAll={dashboard.isSyncingAll}
                isLoading={dashboard.isLoading}
                syncProgress={dashboard.syncProgress}
                syncAllProgress={dashboard.syncAllProgress}
                deviceSyncResults={dashboard.deviceSyncResults}
                deviceInfo={dashboard.deviceInfo}
                connectionError={dashboard.connectionError}
                showDeviceModal={dashboard.showDeviceModal}
                isEditingDevice={dashboard.isEditingDevice}
                editingDevice={dashboard.editingDevice}
                isAddingDevice={dashboard.isAddingDevice}
                handleSyncToDatabase={dashboard.handleSyncToDatabase}
                handleSyncAllDevices={dashboard.handleSyncAllDevices}
                handleSyncUsersOnly={dashboard.handleSyncUsersOnly}
                handleSyncUsersOnlyAll={dashboard.handleSyncUsersOnlyAll}
                handleStopSync={dashboard.handleStopSync}
                handleOpenAddModal={dashboard.handleOpenAddModal}
                handleStartEdit={dashboard.handleStartEdit}
                handleSelectDevice={dashboard.handleSelectDevice}
                handleDisconnect={dashboard.handleDisconnect}
                handleDeleteDevice={dashboard.handleDeleteDevice}
                handleAddDevice={dashboard.handleAddDevice}
                handleUpdateDevice={dashboard.handleUpdateDevice}
                handleGetDeviceTime={dashboard.handleGetDeviceTime}
                handleSetDeviceTime={dashboard.handleSetDeviceTime}
                setShowDeviceModal={dashboard.setShowDeviceModal}
                      />
                    )}

            {dashboard.activeTab === 'settings' && (
              <SettingsTab
                PAGE_SIZE={dashboard.PAGE_SIZE}
              />
            )}

            {dashboard.activeTab === 'help' && (
              <HelpTab />
            )}
                  </div>
        </main>
        </div>
      </div>
    </div>
  );
}
