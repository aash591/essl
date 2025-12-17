import React from 'react';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'primary' | 'accent' | 'warning' | 'info';
}

export default function StatCard({
  icon,
  label,
  value,
  color
}: StatCardProps) {
  const colorClasses = {
    primary: 'from-primary/20 to-primary/5 text-primary',
    accent: 'from-accent/20 to-accent/5 text-accent',
    warning: 'from-yellow-500/20 to-yellow-500/5 text-yellow-500',
    info: 'from-blue-400/20 to-blue-400/5 text-blue-400',
  };

  return (
    <div className="glass-card rounded-xl p-5 group transition-all">
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className="text-3xl font-bold metric-value">{value.toLocaleString()}</p>
    </div>
  );
}

