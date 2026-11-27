"use client";

import type { ResumeCoverLetter } from "@angisoft/mboqara-contracts";

const FIELDS: ReadonlyArray<{
  field: keyof ResumeCoverLetter;
  label: string;
  placeholder: string;
  long?: boolean;
  wide?: boolean;
}> = [
  { field: "recipientName", label: "Recipient name", placeholder: "Priya Menon" },
  { field: "recipientCompany", label: "Recipient company", placeholder: "Acme Technologies" },
  { field: "recipientAddress", label: "Recipient address", placeholder: "Nairobi, Kenya" },
  { field: "subject", label: "Subject", placeholder: "Application for ...", wide: true },
  { field: "greeting", label: "Greeting", placeholder: "Dear Priya Menon," },
  { field: "signoff", label: "Sign-off", placeholder: "Kind regards" },
];

export interface CoverLetterEditorProps {
  letter: ResumeCoverLetter;
  onChange: (letter: ResumeCoverLetter) => void;
}

/** Cover-letter editor: recipient, subject, greeting, body and sign-off. */
export function CoverLetterEditor({ letter, onChange }: CoverLetterEditorProps) {
  return (
    <section className="rk-panel" aria-label="Cover letter">
      <header className="rk-panel-head">
        <h2 className="rk-heading">Cover letter</h2>
        <p className="rk-panel-note">
          Keep it focused on the role, what you have done and what you can do for them.
        </p>
      </header>

      <div className="rk-fields">
        {FIELDS.map((field) => (
          <div key={field.field} className={field.wide ? "rk-field rk-field--wide" : "rk-field"}>
            <label className="rk-label" htmlFor={`cover-${field.field}`}>
              {field.label}
            </label>
            <input
              id={`cover-${field.field}`}
              className="rk-input"
              value={letter[field.field]}
              placeholder={field.placeholder}
              onChange={(event) =>
                onChange({ ...letter, [field.field]: event.target.value })
              }
            />
          </div>
        ))}

        <div className="rk-field rk-field--wide">
          <label className="rk-label" htmlFor="cover-body">
            Body
          </label>
          <textarea
            id="cover-body"
            className="rk-textarea"
            rows={16}
            value={letter.body}
            placeholder="Dear hiring team,&#10;&#10;I am writing to apply for…"
            onChange={(event) => onChange({ ...letter, body: event.target.value })}
          />
        </div>
      </div>
    </section>
  );
}