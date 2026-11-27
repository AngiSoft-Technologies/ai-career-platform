"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, Plus } from "lucide-react";
import {
  RESUME_SECTION_CATALOG,
  sectionDefinition,
  type ResumeSection,
  type ResumeSectionType,
} from "@angisoft/mboqara-contracts";

interface SectionRailProps {
  sections: ResumeSection[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onReorder: (fromId: string, toIndex: number) => void;
  onAdd: (type: ResumeSectionType) => void;
}

interface DragState {
  id: string;
  pointerId: number;
  /** Where the dragged section will land in the current list order. */
  overIndex: number;
}



/**
 * The section rail: choose the contact block, add a section that is not in
 * the document yet, and reorder what is already there.
 */
export function SectionRail({
  sections,
  activeId,
  onSelect,
  onReorder,
  onAdd,
}: SectionRailProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const dragRef = useRef<DragState | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const rectsRef = useRef<Array<{ id: string; midpoint: number }>>([]);
  const menuRef = useRef<HTMLDetailsElement | null>(null);

  const setDragState = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const captureRects = useCallback(() => {
    rectsRef.current = sections
      .map((section) => {
        const element = rowRefs.current.get(section.id);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { id: section.id, midpoint: rect.top + rect.height / 2 };
      })
      .filter((value): value is { id: string; midpoint: number } => value !== null);
  }, [sections]);

  const indexFor = useCallback((pointerY: number): number => {
    const rects = rectsRef.current;
    for (let index = 0; index < rects.length; index += 1) {
      if (rects[index] && pointerY < rects[index].midpoint) return index;
    }
    return rects.length;
  }, []);

  const endDrag = useCallback(
    (commit: boolean) => {
      const current = dragRef.current;
      setDragState(null);
      if (!commit || !current) return;
      const from = sections.findIndex((section) => section.id === current.id);
      if (from < 0) return;
      const target = current.overIndex > from ? current.overIndex - 1 : current.overIndex;
      if (target === from) return;
      onReorder(current.id, target);
      setAnnouncement(
        `${sectionDefinition(
          sections[from]?.type ?? "custom",
        ).label} moved to position ${target + 1} of ${sections.length}.`,
      );
    },
    [onReorder, sections, setDragState],
  );

  useEffect(() => {
    if (!drag) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") endDrag(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag, endDrag]);

  const available = RESUME_SECTION_CATALOG.filter((definition) =>
    definition.type === "custom"
      ? true
      : !sections.some((section) => section.type === definition.type),
  );
  const standard = available.filter((definition) => definition.type !== "custom");
  const custom = available.filter((definition) => definition.type === "custom");

  return (
    <aside className="rk-rail" aria-label="Resume sections">
      <div className="rk-rail-heading">
        <h2>Sections</h2>
        <span>{sections.length + 1}</span>
      </div>

      <ul className="rk-section-list">
        <li>
          <button
            type="button"
            className="rk-section-row"
            data-active={activeId === null}
            aria-current={activeId === null}
            onClick={() => onSelect(null)}
          >
            <span className="rk-section-select">
              <span>Contact details</span>
              <small className="rk-section-type">Name, contacts, photo</small>
            </span>
          </button>
        </li>

        {sections.map((section, index) => {
          const definition = sectionDefinition(section.type);
          const isActive = section.id === activeId;
          const dragging = drag?.id === section.id;

          return (
            <li key={section.id} className="contents">
              <div
                ref={(element) => {
                  if (element) rowRefs.current.set(section.id, element);
                  else rowRefs.current.delete(section.id);
                }}
                className="rk-section-row"
                data-active={isActive}
                onClick={() => onSelect(section.id)}
              >
                <button
                  type="button"
                  className="rk-icon-btn rk-drag-handle"
                  aria-label={`Move ${section.title || definition.label}`}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    captureRects();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDragState({
                      id: section.id,
                      pointerId: event.pointerId,
                      overIndex: index,
                    });
                  }}
                  onPointerMove={(event) => {
                    const current = dragRef.current;
                    if (!current || current.pointerId !== event.pointerId) return;
                    const next = indexFor(event.clientY);
                    if (next !== current.overIndex) {
                      setDragState({ ...current, overIndex: next });
                    }
                  }}
                  onPointerUp={() => endDrag(true)}
                  onPointerCancel={() => endDrag(false)}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                    event.preventDefault();
                    const to = event.key === "ArrowUp" ? index - 1 : index + 1;
                    if (to < 0 || to >= sections.length) return;
                    onReorder(section.id, to);
                    setAnnouncement(
                      `${definition.label} moved to position ${to + 1} of ${sections.length}.`,
                    );
                  }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <GripVertical size={13} />
                </button>

                <button
                  type="button"
                  className="rk-section-select"
                  aria-current={isActive}
                >
                  <span>{section.title || definition.label}</span>
                  <small className="rk-section-type">{definition.label}</small>
                </button>

                <span
                  className="rk-section-index"
                  aria-label={`Position ${index + 1} of ${sections.length}`}
                >
                  {index + 1}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <details ref={menuRef} className="rk-add">
        <summary>Add section</summary>
        <div className="rk-add-panel" role="menu">
          {standard.length ? (
            <div className="rk-add-group">
              <p className="rk-add-group-title">Standard sections</p>
              {standard.map((definition) => (
                <button
                  key={definition.type}
                  type="button"
                  className="rk-add-option"
                  role="menuitem"
                  onClick={() => {
                    onAdd(definition.type);
                    if (menuRef.current) menuRef.current.open = false;
                  }}
                >
                  <span>{definition.label}</span>
                </button>
              ))}
            </div>
          ) : null}
          {custom.length ? (
            <div className="rk-add-group">
              <p className="rk-add-group-title">Custom sections</p>
              {custom.map((definition) => (
                <button
                  key={definition.type}
                  type="button"
                  className="rk-add-option"
                  role="menuitem"
                  onClick={() => {
                    onAdd(definition.type);
                    if (menuRef.current) menuRef.current.open = false;
                  }}
                >
                  <span>{definition.label}…</span>
                </button>
              ))}
            </div>
          ) : null}
          {standard.length === 0 && custom.length === 0 ? (
            <p className="rk-add-group-title">Every section is already in this document.</p>
          ) : null}
        </div>
      </details>

      <p className="rk-panel-note">Drag a section, or use the arrow keys, to reorder it.</p>
      <p className="rk-sr-only" role="status">
        {announcement}
      </p>
    </aside>
  );
}

