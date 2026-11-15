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
import { Button, Card, Input, SectionTitle, Skeleton, cx } from "@/components/ui";
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
}

export function TemplateGallery({
  selectedTemplate,
  onSelect,
  documentType = "cv",
  className,
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
      const matchesCategory = category === "all" || template.category === category;
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

  const visible = isCoverLetter ? filteredCover : filteredResume;

  return (
    <Card className={cx("p-4", className)}>
      <SectionTitle
        eyebrow={isCoverLetter ? "Cover letters" : "Templates"}
        title={isCoverLetter ? "Choose a letter style" : "Choose your layout"}
        description={
          isCoverLetter
            ? "Tone and structure are applied when the agent drafts the letter."
            : `${resumeTemplates.length} layouts. Every one marked ATS-safe parses cleanly.`
        }
      />

      <div className="mt-4 flex flex-col gap-3">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-app-muted"
          />
          <Input
            placeholder="Search templates"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        {!isCoverLetter && categories.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
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
        <div className="mt-4 flex flex-col gap-2.5">
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      ) : (
        <div className="mt-4 grid max-h-[360px] grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5 overflow-y-auto pr-1">
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

      {visible.length === 0 ? (
        <p className="px-4 py-6 text-center text-[0.85rem] text-app-muted">
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
      aria-pressed={selected}
      className={cx(
        "flex cursor-pointer flex-col gap-1.5 rounded-app-md p-2.5 text-left transition-colors duration-150",
        selected
          ? "border-2 border-app-accent bg-app-accent-soft"
          : "border border-app-border bg-app-surface hover:border-app-border-strong",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[0.82rem] font-semibold text-app-text">{label}</span>
        {selected ? (
          <Check size={15} className="shrink-0 text-app-accent" />
        ) : (
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: accent }}
          />
        )}
      </span>
      <span className="text-[0.72rem] leading-[1.35] text-app-muted">{description}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-[0.62rem] tracking-[0.04em] text-app-muted uppercase">{meta}</span>
        {atsSafe === undefined ? null : (
          <span
            className={cx(
              "inline-flex items-center gap-0.5 text-[0.62rem]",
              atsSafe ? "text-app-success" : "text-app-warning",
            )}
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
