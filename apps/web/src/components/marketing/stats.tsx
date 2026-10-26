"use client";

import { useEffect, useState, type ReactNode } from "react";
import { API_URL } from "@/lib/auth";
import { Compass, ClipboardList, Zap, FolderKanban, Building2, Globe, Briefcase } from "lucide-react";
import { Counter } from "./counter";
import { Reveal } from "./reveal";

interface StatItem {
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  icon?: ReactNode;
}

interface StatsProps {
  items: StatItem[];
  className?: string;
  fallback?: StatItem[];
}

export function Stats({ items, className, fallback }: StatsProps) {
  const [data, setData] = useState<StatItem[]>(fallback ?? items);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/stats`, { credentials: "include" })
      .then((r) => r.ok && r.json())
      .then((d) => {
        if (!cancelled) {
          setData([
            { label: "Active roles", value: d.activeJobs ?? 0, icon: <Compass className="mk-stat__icon-svg" /> },
            { label: "Total jobs", value: d.totalJobs ?? 0, icon: <ClipboardList className="mk-stat__icon-svg" /> },
            { label: "New this week", value: d.newThisWeek ?? 0, icon: <Zap className="mk-stat__icon-svg" />, suffix: "+" },
            { label: "Professions mapped", value: d.professions ?? 0, icon: <FolderKanban className="mk-stat__icon-svg" /> },
            { label: "Companies indexed", value: d.companies ?? 0, icon: <Building2 className="mk-stat__icon-svg" /> },
            { label: "Live sources", value: d.sources ?? 0, icon: <Globe className="mk-stat__icon-svg" /> },
          ]);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fallback]);

  return (
    <div className={className} role="list" aria-label="Platform statistics">
      {data.map((stat, i) => (
        <Reveal key={stat.label} delay={i * 80} className="mk-stat">
          <div className="mk-stat__icon" aria-hidden="true">{stat.icon}</div>
          <Counter value={stat.value} suffix={stat.suffix} prefix={stat.prefix} duration={1600} delay={i * 80} className="mk-stat__counter" />
          <div className="mk-stat__label">{stat.label}</div>
        </Reveal>
      ))}
    </div>
  );
}