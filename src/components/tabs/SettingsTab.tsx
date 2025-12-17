import React, { useState } from 'react';
import { Building2, Briefcase, Clock } from 'lucide-react';
import DepartmentsDesignationsTab from '@/components/tabs/settings/DepartmentsDesignationsTab';
import ShiftsTab from '@/components/tabs/settings/ShiftsTab';

interface SettingsTabProps {
  PAGE_SIZE: number;
}

type SectionType = 'departments' | 'designations' | 'shifts';

export default function SettingsTab({ PAGE_SIZE }: SettingsTabProps) {
  const [activeSection, setActiveSection] = useState<SectionType>('departments');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Section Tabs */}
      <div className="flex gap-2 border-b border-border/50">
        <button
          onClick={() => {
            setActiveSection('departments');
          }}
          className={`px-4 py-2 text-sm font-medium transition-all border-b-2 ${
            activeSection === 'departments'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Departments
          </div>
        </button>
        <button
          onClick={() => {
            setActiveSection('designations');
          }}
          className={`px-4 py-2 text-sm font-medium transition-all border-b-2 ${
            activeSection === 'designations'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Designations
          </div>
        </button>
        <button
          onClick={() => {
            setActiveSection('shifts');
          }}
          className={`px-4 py-2 text-sm font-medium transition-all border-b-2 ${
            activeSection === 'shifts'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Shifts
          </div>
        </button>
      </div>

      {activeSection === 'shifts' ? (
        <ShiftsTab />
      ) : (
        <DepartmentsDesignationsTab
          PAGE_SIZE={PAGE_SIZE}
          activeSection={activeSection === 'departments' ? 'departments' : 'designations'}
        />
      )}
    </div>
  );
}

