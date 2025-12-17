import React from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
}

export default function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="px-6 py-2 border-b border-border/50 bg-card/80 backdrop-blur-sm flex-shrink-0">
      <h2 className="text-lg font-bold leading-tight m-0">{title}</h2>
      <p className="text-xs text-muted-foreground leading-tight mt-0.5 m-0">{description}</p>
    </div>
  );
}

