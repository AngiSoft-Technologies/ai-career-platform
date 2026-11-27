"use client";

import { useEffect, useRef, useState } from "react";
import {
  resumeTemplateShape,
  sectionDefinition,
  type ResumeDocument,
  type ResumeEntry,
  type ResumeMargins,
  type ResumeSection,
} from "@angisoft/mboqara-contracts";
import {
  FONT_STACKS,
  PX_PER_MM,
  SHEET_SIZE,
  SHEET_TYPE_SIZE,
} from "./tokens";

interface SheetPreviewProps {
  document: ResumeDocument;
  template: string;
  /** The sheet is never drawn larger than this on a wide screen. */
  maxScale?: number;
}

function padding(margins: ResumeMargins): string {
  return `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`;
}

function entryBody(entry: ResumeEntry): string {
  if (entry.summary.trim()) return entry.summary;
  const lines = [entry.title.trim(), entry.tags.join(", ")]
    .filter(Boolean)
    .join(", ");
  return lines.trim();
}

/**
 * The printed page, drawn at its real size and scaled into the preview.
 *
 * The template contributes the arrangement; the document's own design
 * contributes the voice. This is the same arrangement the exporter uses, so
 * what the candidate sees is what they download.
 */
export function SheetPreview({
  document,
  template,
  maxScale = 0.52,
}: SheetPreviewProps) {
  const page = SHEET_SIZE[document.design.pageSize];
  const margins = document.design.margins;
  const bodySize = SHEET_TYPE_SIZE[document.design.textSize];
  const shape = resumeTemplateShape(template);
  const { contact, design } = document;
  const isLetter = document.kind === "cover_letter";

  const hostRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(maxScale);
  const [sheetHeight, setSheetHeight] = useState(page.height * PX_PER_MM);
  const [narrow, setNarrow] = useState(false);

  const pageWidth = page.width * PX_PER_MM;
  const pageHeight = page.height * PX_PER_MM;

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const sheet = sheetRef.current;
    if (!host || !sheet) return;

    const measure = () => {
      const available = host.clientWidth;
      if (!available) return;
      const fit = available / pageWidth;
      setScale(narrow ? Math.max(fit, 0.75) : Math.min(fit, maxScale));
      setSheetHeight(Math.max(sheet.offsetHeight, pageHeight));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [pageWidth, pageHeight, maxScale, narrow, document]);

  const contactLine = [
    contact.email,
    contact.phone,
    contact.location,
    contact.website,
    contact.linkedin,
  ]
    .filter(Boolean)
    .join("  ·  ");
  const displayName = [contact.fullName, contact.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={hostRef} className="rk-paper-host">
      <div
        style={{ width: pageWidth * scale, height: sheetHeight * scale }}
        className="relative mx-auto"
      >
        <div
          ref={sheetRef}
          className="rk-paper"
          style={{
            width: `${page.width}mm`,
            minHeight: `${page.height}mm`,
            padding: padding(margins),
            transform: `scale(${scale})`,
            fontFamily: FONT_STACKS[design.font],
            color: design.textColor,
            fontSize: `${bodySize}pt`,
          }}
        >
          <header className="rk-sheet-header">
            {shape.photo && design.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={design.photoUrl} alt="" className="rk-sheet-photo" />
            ) : null}
            <div className="min-w-0 flex-1">
              <h1
                style={{
                  fontSize: `${bodySize * 2.1}pt`,
                  lineHeight: 1.12,
                  borderLeft: shape.nameBorder
                    ? `1.2mm solid ${design.accentColor}`
                    : undefined,
                  paddingLeft: shape.nameBorder ? "3mm" : undefined,
                }}
              >
                {displayName || "Your name"}
              </h1>
              {contact.headline ? (
                <p style={{ fontSize: `${bodySize * 1.15}pt` }}>{contact.headline}</p>
              ) : null}
              {contactLine ? (
                <p style={{ fontSize: `${bodySize * 0.92}pt` }}>{contactLine}</p>
              ) : null}
              {shape.contactRule ? (
                <div
                  style={{
                    height: "0.5mm",
                    marginTop: "3mm",
                    background: design.accentColor,
                    opacity: 0.55,
                  }}
                />
              ) : null}
            </div>
          </header>

          {isLetter && document.coverLetter ? (
            <div className="rk-sheet-sections">
              <p style={{ fontWeight: 600 }}>{document.coverLetter.subject}</p>
              <p>{document.coverLetter.greeting}</p>
              <p style={{ whiteSpace: "pre-wrap" }}>{document.coverLetter.body}</p>
              <p>{document.coverLetter.signoff}</p>
            </div>
          ) : (
            <div className="rk-sheet-sections">
              {document.sections.map((section) => (
                <SheetSection
                  key={section.id}
                  section={section}
                  bodySize={bodySize}
                  shape={shape}
                  accent={design.accentColor}
                  isLetter={isLetter}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SheetSection({
  section,
  bodySize,
  shape,
  accent,
  isLetter,
}: {
  section: ResumeSection;
  bodySize: number;
  shape: ReturnType<typeof resumeTemplateShape>;
  accent: string;
  isLetter: boolean;
}) {
  const definition = sectionDefinition(section.type);
  const title = section.title.trim() || definition.defaultTitle;
  const showHeading = !(isLetter && !section.title.trim());

  if (definition.singleBlock) {
    const body = section.entries
      .map((entry) => entryBody(entry))
      .filter(Boolean)
      .join("\n\n");
    if (!body) return null;
    return (
      <section className="rk-sheet-section">
        {showHeading ? (
          <SheetHeading title={title} bodySize={bodySize} shape={shape} accent={accent} />
        ) : null}
        <p style={{ fontSize: `${bodySize}pt`, whiteSpace: "pre-wrap" }}>{body}</p>
      </section>
    );
  }

  const entries = section.entries.filter((entry) =>
    [
      entry.title.trim(),
      entry.organisation.trim(),
      entry.date.trim(),
      entry.startDate.trim(),
      entry.endDate.trim(),
      entry.location.trim(),
      entry.url.trim(),
      entryBody(entry),
    ].some(Boolean),
  );
  if (!entries.length) return null;

  return (
    <section className="rk-sheet-section">
      {showHeading ? (
        <SheetHeading title={title} bodySize={bodySize} shape={shape} accent={accent} />
      ) : null}
      <div>
        {entries.map((entry) => (
          <SheetEntry
            key={entry.id}
            className="rk-sheet-entry"
            entry={entry}
            type={section.type}
            bodySize={bodySize}
          />
        ))}
      </div>
    </section>
  );
}

function SheetHeading({
  title,
  bodySize,
  shape,
  accent,
}: {
  title: string;
  bodySize: number;
  shape: ReturnType<typeof resumeTemplateShape>;
  accent: string;
}) {
  return (
    <h2
      className="rk-sheet-heading"
      style={{
        fontSize: `${bodySize * 0.92}pt`,
        color: shape.colouredHeadings ? accent : "#4a4237",
        paddingBottom: shape.headingRule ? "1mm" : undefined,
        borderBottom: shape.headingRule ? `0.35mm solid ${accent}` : undefined,
      }}
    >
      {title}
    </h2>
  );
}

function SheetEntry({
  entry,
  type,
  bodySize,
  className,
}: {
  entry: ResumeEntry;
  type: ResumeSection["type"];
  bodySize: number;
  className?: string;
}) {
  const date = entry.date.trim() ||
    [
      entry.startDate.trim(),
      entry.current ? "Present" : entry.endDate.trim(),
    ]
      .filter(Boolean)
      .join(" – ");
  const meta = [entry.location.trim(), date].filter(Boolean).join("  ·  ");

  if (type === "languages") {
    return (
      <p className={className} style={{ fontSize: `${bodySize}pt` }}>
        <span style={{ fontWeight: 600 }}>{entry.title}</span>
        {entry.summary ? ` — ${entry.summary}` : ""}
      </p>
    );
  }

  const heading = [entry.title.trim(), entry.organisation.trim()]
    .filter(Boolean)
    .join(" — ");
  const body = entryBody(entry);

  return (
    <div className={className}>
      {heading ? (
        <p style={{ fontSize: `${bodySize}pt`, fontWeight: 600 }}>{heading}</p>
      ) : null}
      {meta ? (
        <p style={{ fontSize: `${bodySize * 0.88}pt` }}>{meta}</p>
      ) : null}
      {body ? (
        <p style={{ fontSize: `${bodySize}pt`, marginTop: "1mm", whiteSpace: "pre-wrap" }}>
          {body}
        </p>
      ) : null}
      {entry.bullets.length ? (
        <ul className="rk-sheet-list" style={{ fontSize: `${bodySize}pt` }}>
          {entry.bullets
            .filter((bullet) => bullet.trim())
            .map((bullet, index) => (
              <li key={`${entry.id}-bullet-${index}`}>{bullet}</li>
            ))}
        </ul>
      ) : null}
      {entry.tags.length ? (
        <p style={{ fontSize: `${bodySize * 0.9}pt`, marginTop: "1mm" }}>
          {entry.tags.join(" · ")}
        </p>
      ) : null}
      {entry.url ? (
        <p
          style={{
            fontSize: `${bodySize * 0.88}pt`,
            marginTop: "1mm",
            overflowWrap: "anywhere",
          }}
        >
          {entry.url}
        </p>
      ) : null}
    </div>
  );
}