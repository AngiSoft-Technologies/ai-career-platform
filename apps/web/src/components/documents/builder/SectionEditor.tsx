"use client";

import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import {
  emptyResumeEntry,
  sectionDefinition,
  type ResumeEntry,
  type ResumeSection,
} from "@angisoft/mboqara-contracts";

interface SectionEditorProps {
  section: ResumeSection;
  onChange: (section: ResumeSection) => void;
  onRemove: (sectionId: string) => void;
}

/** The section being written: rename it, add an entry, reorder or delete it. */
export function SectionEditor({
  section,
  onChange,
  onRemove,
}: SectionEditorProps) {
  const definition = sectionDefinition(section.type);
  const isSingle = definition.singleBlock || section.type === "skills";

  const patchEntry = (entryId: string, patch: Partial<ResumeEntry>) => {
    onChange({
      ...section,
      entries: section.entries.map((entry) =>
        entry.id === entryId ? { ...entry, ...patch } : entry,
      ),
    });
  };

  const addEntry = (atTop = false) => {
    const entry = emptyResumeEntry();
    onChange({
      ...section,
      entries: atTop ? [entry, ...section.entries] : [...section.entries, entry],
    });
  };

  const moveEntry = (entryId: string, direction: -1 | 1) => {
    const from = section.entries.findIndex((entry) => entry.id === entryId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= section.entries.length) return;
    const next = [...section.entries];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    onChange({ ...section, entries: next });
  };

  const removeEntry = (entryId: string) => {
    onChange({
      ...section,
      entries: section.entries.filter((entry) => entry.id !== entryId),
    });
  };

  const singleEntry = section.entries[0];

  return (
    <section className="rk-panel" aria-label={section.title || definition.label}>
      <header className="rk-panel-head">
        <div className="rk-section-title-row">
          <label className="rk-sr-only" htmlFor={`section-title-${section.id}`}>
            Section title
          </label>
          <input
            id={`section-title-${section.id}`}
            className="rk-section-title"
            value={section.title}
            placeholder={definition.defaultTitle}
            onChange={(event) => onChange({ ...section, title: event.target.value })}
          />
          <button
            type="button"
            className="rk-btn rk-btn--quiet"
            onClick={() => onRemove(section.id)}
          >
            <Trash2 size={14} />
            Delete section
          </button>
        </div>
        <p className="rk-panel-note">Every field is optional. Blank ones are left out.</p>
      </header>

      {isSingle ? (
        <div className="rk-fields">
          <div className="rk-field rk-field--wide">
            <label className="rk-label" htmlFor={`section-summary-${section.id}`}>
              {definition.fields[0]?.label ?? "Details"}
            </label>
            <textarea
              id={`section-summary-${section.id}`}
              className="rk-textarea"
              rows={section.type === "skills" ? 6 : 7}
              value={singleEntry?.summary ?? ""}
              placeholder={definition.fields[0]?.placeholder}
              onChange={(event) => {
                const entry = singleEntry ?? emptyResumeEntry();
                onChange({
                  ...section,
                  entries: [{ ...entry, summary: event.target.value }],
                });
              }}
            />
          </div>
        </div>
      ) : (
        <>
          {definition.addAtTop ? (
            <div className="rk-add-actions">
              <button type="button" className="rk-btn" onClick={() => addEntry(true)}>
                <Plus size={14} />
                Add {definition.entryLabel} at the top
              </button>
            </div>
          ) : null}

          {section.entries.length === 0 ? (
            <div className="rk-empty">
              <p>Add your first {definition.entryLabel}</p>
              <button type="button" className="rk-btn" onClick={() => addEntry()}>
                <Plus size={14} />
                Add {definition.entryLabel}
              </button>
            </div>
          ) : (
            <div className="rk-entry-list">
              {section.entries.map((entry, index) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  total={section.entries.length}
                  sectionId={section.id}
                  fields={definition.fields}
                  onChange={(patch) => patchEntry(entry.id, patch)}
                  onMove={(direction) => moveEntry(entry.id, direction)}
                  onRemove={() => removeEntry(entry.id)}
                />
              ))}
              <div className="rk-add-actions">
                <button type="button" className="rk-btn" onClick={() => addEntry()}>
                  <Plus size={14} />
                  Add {definition.entryLabel} at the end
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EntryCard({
  entry,
  index,
  total,
  sectionId,
  fields,
  onChange,
  onMove,
  onRemove,
}: {
  entry: ResumeEntry;
  index: number;
  total: number;
  sectionId: string;
  fields: ReturnType<typeof sectionDefinition>["fields"];
  onChange: (patch: Partial<ResumeEntry>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <article className="rk-entry">
      <header className="rk-entry-head">
        <span className="rk-entry-order" aria-hidden>
          <GripVertical size={13} />
          {index + 1}
        </span>
        <h3 className="rk-entry-title">
          {entry.title || entry.organisation || "New entry"}
        </h3>
        <div className="rk-entry-actions">
          <button
            type="button"
            className="rk-icon-btn"
            aria-label={`Move entry ${index + 1} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={13} />
          </button>
          <button
            type="button"
            className="rk-icon-btn"
            aria-label={`Move entry ${index + 1} down`}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={13} />
          </button>
          <button
            type="button"
            className="rk-icon-btn"
            data-danger="true"
            aria-label={`Delete entry ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </header>

      <div className="rk-fields">
        {fields.map((field) => (
          <EntryField
            key={field.field}
            field={field}
            entry={entry}
            sectionId={sectionId}
            index={index}
            onChange={onChange}
          />
        ))}
      </div>
    </article>
  );
}

function EntryField({
  field,
  entry,
  sectionId,
  index,
  onChange,
}: {
  field: ReturnType<typeof sectionDefinition>["fields"][number];
  entry: ResumeEntry;
  sectionId: string;
  index: number;
  onChange: (patch: Partial<ResumeEntry>) => void;
}) {
  const id = `${sectionId}-${entry.id}-${index}-${field.field}`;
  const wide = field.long ? "rk-field rk-field--wide" : "rk-field";

  if (field.field === "summary" && field.long) {
    return (
      <div className={wide}>
        <label className="rk-label" htmlFor={id}>
          {field.label}
        </label>
        <textarea
          id={id}
          className="rk-textarea"
          rows={4}
          value={entry.summary}
          placeholder={field.placeholder}
          onChange={(event) => onChange({ summary: event.target.value })}
        />
      </div>
    );
  }

  const value = entry[field.field as keyof ResumeEntry];

  return (
    <div className={wide}>
      <label className="rk-label" htmlFor={id}>
        {field.label}
      </label>
      <input
        id={id}
        className="rk-input"
        type={field.field === "url" ? "url" : "text"}
        value={typeof value === "string" ? value : ""}
        placeholder={field.placeholder}
        onChange={(event) => onChange({ [field.field]: event.target.value })}
      />
    </div>
  );
}