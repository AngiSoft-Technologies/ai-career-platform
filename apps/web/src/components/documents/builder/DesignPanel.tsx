"use client";

import {
  RESUME_ACCENT_COLOURS,
  RESUME_FONTS,
  RESUME_PAGE_SIZES,
  RESUME_TEMPLATE_CATALOGUE,
  RESUME_TEXT_SIZES,
  type ResumeDesign,
} from "@angisoft/mboqara-contracts";
import {
  FONT_STACKS,
  SHEET_EDGES,
  TEXT_SWATCHES,
} from "./tokens";

interface DesignPanelProps {
  template: string;
  design: ResumeDesign;
  onTemplateChange: (template: string) => void;
  onDesignChange: (design: ResumeDesign) => void;
}

const EDGE_MAX = 30;

/** Design controls: template, type, colour, density, page size and margins. */
export function DesignPanel({
  template,
  design,
  onTemplateChange,
  onDesignChange,
}: DesignPanelProps) {
  const patch = (next: Partial<ResumeDesign>) =>
    onDesignChange({ ...design, ...next });

  return (
    <div className="rk-design-grid">
      <section className="rk-panel" aria-label="Template">
        <header className="rk-panel-head">
          <h2 className="rk-heading">Template</h2>
          <p className="rk-panel-note">
            {RESUME_TEMPLATE_CATALOGUE.length} layouts. Six are open on this account; premium ones are marked.
          </p>
        </header>
        <div className="rk-template-grid">
          {RESUME_TEMPLATE_CATALOGUE.map((item) => {
            const selected = template === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className="rk-template"
                data-selected={selected}
                aria-pressed={selected}
                disabled={Boolean(item.locked)}
                title={item.locked ? `${item.label} is a premium template` : item.description}
                onClick={() => onTemplateChange(item.key)}
              >
                <span className="rk-template-page" aria-hidden>
                  {item.photo ? <span className="rk-template-photo" /> : null}
                  <span className="rk-template-title" />
                  <span className="rk-template-line" />
                  <span className="rk-template-line" />
                </span>
                <strong>{item.label}</strong>
                <small>{item.locked ? "Premium" : "Free"}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rk-panel" aria-label="Font, colour and text size">
        <header className="rk-panel-head">
          <h2 className="rk-heading">Font, colour & size</h2>
          <p className="rk-panel-note">These settings apply live to the sheet below.</p>
        </header>

        <div className="rk-fields">
          <div className="rk-field rk-field--wide">
            <label className="rk-label" htmlFor="design-font">
              Font
            </label>
            <select
              id="design-font"
              className="rk-select"
              value={design.font}
              onChange={(event) => patch({ font: event.target.value as ResumeDesign["font"] })}
            >
              {RESUME_FONTS.map((font) => (
                <option key={font.key} value={font.key}>
                  {font.label}
                </option>
              ))}
            </select>
            <p
              className="rk-panel-note"
              style={{ fontFamily: FONT_STACKS[design.font] }}
            >
              Preview: The quick brown fox jumps over the lazy dog.
            </p>
          </div>

          <div className="rk-field rk-field--wide">
            <span className="rk-label">Accent colour</span>
            <div className="rk-swatch-row">
              {RESUME_ACCENT_COLOURS.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  className="rk-swatch"
                  style={{ background: colour }}
                  aria-pressed={design.accentColor.toLowerCase() === colour.toLowerCase()}
                  aria-label={`Use accent ${colour}`}
                  onClick={() => patch({ accentColor: colour })}
                />
              ))}
              <label className="rk-custom-colour">
                Custom
                <input
                  type="color"
                  value={design.accentColor}
                  onChange={(event) => patch({ accentColor: event.target.value })}
                />
              </label>
            </div>
          </div>

          <div className="rk-field rk-field--wide">
            <span className="rk-label">Text colour</span>
            <div className="rk-swatch-row">
              {TEXT_SWATCHES.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  className="rk-swatch"
                  style={{ background: colour }}
                  aria-pressed={design.textColor.toLowerCase() === colour.toLowerCase()}
                  aria-label={`Use text ${colour}`}
                  onClick={() => patch({ textColor: colour })}
                />
              ))}
              <label className="rk-custom-colour">
                Custom
                <input
                  type="color"
                  value={design.textColor}
                  onChange={(event) => patch({ textColor: event.target.value })}
                />
              </label>
            </div>
          </div>

          <div className="rk-field rk-field--wide">
            <span className="rk-label">Text size</span>
            <div className="rk-segmented" role="radiogroup" aria-label="Text size">
              {RESUME_TEXT_SIZES.map((size) => (
                <button
                  key={size.key}
                  type="button"
                  className="rk-seg"
                  aria-pressed={design.textSize === size.key}
                  onClick={() => patch({ textSize: size.key })}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rk-panel" aria-label="Page settings">
        <header className="rk-panel-head">
          <h2 className="rk-heading">Page settings</h2>
          <p className="rk-panel-note">Margins are independent, in millimetres.</p>
        </header>

        <div className="rk-fields">
          <div className="rk-field rk-field--wide">
            <span className="rk-label">Page size</span>
            <div className="rk-segmented" role="radiogroup" aria-label="Page size">
              {RESUME_PAGE_SIZES.map((size) => (
                <button
                  key={size.key}
                  type="button"
                  className="rk-seg"
                  aria-pressed={design.pageSize === size.key}
                  onClick={() => patch({ pageSize: size.key })}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rk-field rk-field--wide">
            <span className="rk-label">Margins (mm)</span>
            <div className="rk-margin-grid">
              {SHEET_EDGES.map((item) => (
                <label key={item.edge} className="rk-margin-field">
                  <span>{item.label}</span>
                  <select
                    className="rk-select"
                    value={design.margins[item.edge]}
                    aria-label={`${item.label} margin`}
                    onChange={(event) =>
                      patch({
                        margins: {
                          ...design.margins,
                          [item.edge]: Math.min(
                            EDGE_MAX,
                            Math.max(0, Number(event.target.value) || 0),
                          ),
                        },
                      })
                    }
                  >
                    {Array.from({ length: EDGE_MAX + 1 }, (_, value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rk-panel" aria-label="Template catalogue">
        <header className="rk-panel-head">
          <h2 className="rk-heading">Template catalogue</h2>
          <p className="rk-panel-note">
            {RESUME_ACCENT_COLOURS.length} default accent colours, {RESUME_FONTS.length} fonts, and photo support where a layout offers it.
          </p>
        </header>
      </section>
    </div>
  );
}