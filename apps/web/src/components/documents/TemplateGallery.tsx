"use client";

import { useMemo, useState } from "react";
import { Check, Search, ShieldCheck, Sparkles } from "lucide-react";
import type {
  CoverLetterTemplateSummary as CoverLetterTemplate,
  ResumeTemplateSummary as ResumeTemplate,
  TemplateCatalogue,
} from "@angisoft/mboqara-contracts";
import {
  FALLBACK_COVER_LETTER_TEMPLATES,
  FALLBACK_RESUME_TEMPLATES,
} from "@angisoft/mboqara-contracts";
import { Badge, Button, Card, Input, SectionTitle, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/hooks";

interface TemplateResponse extends TemplateCatalogue {}

const CATEGORY_LABELS: Record<string, string> = {
  ats: "ATS-safe",
  chronological: "Chronological",
  hybrid: "Hybrid",
  functional: "Functional",
  executive: "Executive",
  technical: "Technical",
  academic: "Academic",
  "role-specific": "Role-specific",
  regional: "Regional",
  entry: "Entry level",
  "one-page": "One page",
  creative: "Creative",
  industry: "Industry",
};

interface TemplateGalleryProps {
  selectedTemplate: string;
  onSelect: (key: string) => void;
  documentType?: "cv" | "cover_letter";
  className?: string;
  style?: React.CSSProperties;
}

export function TemplateGallery({
  selectedTemplate,
  onSelect,
  documentType = "cv",
  className,
  style,
}: TemplateGalleryProps) {
  const { data, loading } = useApi<TemplateResponse>("/documents/templates");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");

  const isCoverLetter = documentType === "cover_letter";
  const resumeTemplates: ResumeTemplate[] = data?.resume?.length
    ? data.resume
    : [...FALLBACK_RESUME_TEMPLATES];
  const coverTemplates: CoverLetterTemplate[] = data?.coverLetter?.length
    ? data.coverLetter
    : [...FALLBACK_COVER_LETTER_TEMPLATES];

  const categories = useMemo(() => {
    if (isCoverLetter) return [];
    const counts = new Map<string, number>();
    for (const template of resumeTemplates) {
      counts.set(template.category, (counts.get(template.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [resumeTemplates, isCoverLetter]);

  const filteredResume = useMemo(() => {
    const term = search.trim().toLowerCase();
    return resumeTemplates.filter((template) => {
      const matchesCategory =
        category === "all" || template.category === category;
      const matchesSearch =
        term.length === 0 ||
        template.label.toLowerCase().includes(term) ||
        template.description.toLowerCase().includes(term) ||
        template.category.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [resumeTemplates, category, search]);

  const filteredCover = useMemo(() => {
    const term = search.trim().toLowerCase();
    return coverTemplates.filter(
      (template) =>
        term.length === 0 ||
        template.label.toLowerCase().includes(term) ||
        template.description.toLowerCase().includes(term),
    );
  }, [coverTemplates, search]);

  return (
    <Card className={className} style={{ padding: "1rem", ...style }}>
      <SectionTitle
        eyebrow={isCoverLetter ? "Cover letters" : "Templates"}
        title={isCoverLetter ? "Choose a letter style" : "Choose your layout"}
        description={
          isCoverLetter
            ? "Tone and structure are applied when the agent drafts the letter."
            : `${resumeTemplates.length} layouts. Every one marked ATS-safe parses cleanly.`
        }
      />

      <div className="stack" style={{ gap: "0.75rem", marginTop: "1rem" }}>
        <div style={{ position: "relative" }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: "0.75rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
            }}
          />
          <Input
            placeholder="Search templates"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ paddingLeft: "2.1rem" }}
          />
        </div>

        {!isCoverLetter && categories.length > 0 ? (
          <div className="row row-wrap" style={{ gap: "0.35rem" }}>
            <Button
              variant={category === "all" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setCategory("all")}
            >
              All
            </Button>
            {categories.map(([key, count]) => (
              <Button
                key={key}
                variant={category === key ? "primary" : "ghost"}
                size="sm"
                onClick={() => setCategory(key)}
              >
                {CATEGORY_LABELS[key] ?? key} ({count})
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {loading && !data ? (
        <div style={{ display: "grid", gap: "0.6rem", marginTop: "1rem" }}>
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
            gap: "0.6rem",
            marginTop: "1rem",
            maxHeight: 360,
            overflowY: "auto",
            paddingRight: "0.25rem",
          }}
        >
          {isCoverLetter
            ? filteredCover.map((template) => (
                <TemplateCard
                  key={template.key}
                  label={template.label}
                  description={template.description}
                  meta={template.tone}
                  accent="#1f2937"
                  selected={selectedTemplate === template.key}
                  onSelect={() => onSelect(template.key)}
                />
              ))
            : filteredResume.map((template) => (
                <TemplateCard
                  key={template.key}
                  label={template.label}
                  description={template.description}
                  meta={CATEGORY_LABELS[template.category] ?? template.category}
                  accent={template.accent}
                  atsSafe={template.atsSafe}
                  selected={selectedTemplate === template.key}
                  onSelect={() => onSelect(template.key)}
                />
              ))}
        </div>
      )}

      {(isCoverLetter ? filteredCover : filteredResume).length === 0 ? (
        <p
          style={{
            textAlign: "center",
            padding: "1.5rem",
            color: "var(--text-muted)",
            fontSize: "0.85rem",
          }}
        >
          No templates match that search.
        </p>
      ) : null}
    </Card>
  );
}

function TemplateCard({
  label,
  description,
  meta,
  accent,
  atsSafe,
  selected,
  onSelect,
}: {
  label: string;
  description: string;
  meta: string;
  accent: string;
  atsSafe?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        border: selected
          ? "2px solid var(--accent)"
          : "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "0.7rem",
        background: selected ? "var(--accent-soft)" : "var(--surface)",
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
      }}
    >
      <span
        className="row"
        style={{ justifyContent: "space-between", gap: "0.4rem" }}
      >
        <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>{label}</span>
        {selected ? (
          <Check size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
        ) : (
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: accent,
              flexShrink: 0,
            }}
          />
        )}
      </span>
      <span
        style={{
          fontSize: "0.72rem",
          color: "var(--text-muted)",
          lineHeight: 1.35,
        }}
      >
        {description}
      </span>
      <span className="row" style={{ gap: "0.3rem", flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: "0.62rem",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "var(--text-muted)",
          }}
        >
          {meta}
        </span>
        {atsSafe === undefined ? null : (
          <span
            className="row"
            style={{
              gap: "0.2rem",
              fontSize: "0.62rem",
              color: atsSafe ? "var(--success)" : "var(--warning)",
            }}
          >
            {atsSafe ? <ShieldCheck size={10} /> : <Sparkles size={10} />}
            {atsSafe ? "ATS-safe" : "Creative"}
          </span>
        )}
      </span>
    </button>
  );
}

export default TemplateGallery;
