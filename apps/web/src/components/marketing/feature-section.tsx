"use client";

import { Reveal } from "./reveal";
import {
  Compass,
  ShieldCheck,
  Brain,
  FileText,
  Briefcase,
  HardDrive,
  Check,
  Sparkles,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ "aria-hidden"?: boolean; className?: string; size?: number }>> = {
  compass: Compass,
  "shield-check": ShieldCheck,
  brain: Brain,
  "file-text": FileText,
  briefcase: Briefcase,
  "hard-drive": HardDrive,
};

interface FeatureSectionProps {
  f: {
    id: string;
    iconName: string;
    title: string;
    subtitle: string;
    text: string;
    details: string[];
  };
  index: number;
}

export function FeatureSection({ f, index }: FeatureSectionProps) {
  const Icon = ICON_MAP[f.iconName] || Compass;
  return (
    <section
      key={f.id}
      className="mk-section"
      id={f.id}
      aria-labelledby={`${f.id}-heading`}
      style={index % 2 === 0 ? {} : { background: "var(--mk-surface)", borderTop: "1px solid var(--mk-border)", borderBottom: "1px solid var(--mk-border)" }}
    >
      <div className="mk-container mk-bento mk-bento--feature">
        <Reveal delay={index * 80} className="mk-bento__feature">
          <div className="mk-card" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div className="mk-card__icon"><Icon aria-hidden={true} /></div>
            <h2 id={`${f.id}-heading`} className="mk-card__title" style={{ fontSize: "clamp(1.4rem, 2.5vw, 2rem)", marginBottom: "12px" }}>{f.title}</h2>
            <p className="mk-section-eyebrow" style={{ marginBottom: "16px", color: "var(--mk-accent)" }}>{f.subtitle}</p>
            <p className="mk-card__text" style={{ fontSize: "1.05rem", lineHeight: 1.75 }}>{f.text}</p>
            <ul style={{ listStyle: "none", padding: 0, margin: "24px 0 0", display: "flex", flexDirection: "column", gap: "10px" }}>
              {f.details.map((d) => (
                <li key={d} style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--mk-text-soft)", fontSize: "0.92rem" }}>
                  <Check className="mk-card__icon" style={{ width: 20, height: 20, color: "var(--mk-success)" }} aria-hidden="true" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={index * 80 + 100}>
          <div className="mk-frame" style={{ backgroundImage: "linear-gradient(180deg, #0a0e1a, #070b14)" }}>
            <div className="mk-frame__bar">
              <div className="mk-frame__dots"><span className="mk-frame__dot" /><span className="mk-frame__dot" /><span className="mk-frame__dot" /></div>
              <span className="mk-frame__title">{f.title}</span>
              <div className="mk-frame__dots" />
            </div>
            <div className="mk-frame__content">
              <div className="mk-mock-list">
                <div className="mk-mock-card">
                  <div className="mk-mock-card__avatar" style={{ background: "var(--mk-accent-soft)", color: "var(--mk-accent)" }}><Sparkles aria-hidden="true" /></div>
                  <div className="mk-mock-card__info">
                    <div className="mk-mock-card__title">{f.title} detail 1</div>
                    <div className="mk-mock-card__meta"><span>Live data</span><span>Updated 2m ago</span></div>
                  </div>
                </div>
                <div className="mk-mock-card">
                  <div className="mk-mock-card__avatar" style={{ background: "var(--mk-accent-soft)", color: "var(--mk-accent)" }}><Sparkles aria-hidden="true" /></div>
                  <div className="mk-mock-card__info">
                    <div className="mk-mock-card__title">{f.title} detail 2</div>
                    <div className="mk-mock-card__meta"><span>Live data</span><span>Updated 2m ago</span></div>
                  </div>
                </div>
                <div className="mk-mock-card">
                  <div className="mk-mock-card__avatar" style={{ background: "var(--mk-accent-soft)", color: "var(--mk-accent)" }}><Sparkles aria-hidden="true" /></div>
                  <div className="mk-mock-card__info">
                    <div className="mk-mock-card__title">{f.title} detail 3</div>
                    <div className="mk-mock-card__meta"><span>Live data</span><span>Updated 2m ago</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}