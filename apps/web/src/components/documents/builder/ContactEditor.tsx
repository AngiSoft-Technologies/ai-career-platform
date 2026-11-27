"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import type { ResumeContact } from "@angisoft/mboqara-contracts";

const FIELDS: ReadonlyArray<{
  field: keyof ResumeContact;
  label: string;
  placeholder: string;
  type?: string;
  wide?: boolean;
}> = [
  { field: "fullName", label: "First name", placeholder: "Your first name" },
  { field: "lastName", label: "Last name", placeholder: "Your last name" },
  { field: "headline", label: "Headline", placeholder: "e.g. Chartered Accountant | Finance Operations", wide: true },
  { field: "email", label: "Email", placeholder: "you@email.com", type: "email" },
  { field: "phone", label: "Phone", placeholder: "Phone number", type: "tel" },
  { field: "website", label: "Website", placeholder: "yoursite.com" },
  { field: "location", label: "Address", placeholder: "City, Country" },
];

export interface ContactEditorProps {
  contact: ResumeContact;
  photoUrl?: string;
  onChange: (contact: ResumeContact) => void;
  onPhotoChange: (photoUrl: string | undefined) => void;
}

/** Contact details, including the 180×180 portrait slot. */
export function ContactEditor({
  contact,
  photoUrl,
  onChange,
  onPhotoChange,
}: ContactEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState("");

  const readPhoto = async (file: File): Promise<string> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("read failed"));
      reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("image failed"));
      element.src = dataUrl;
    });

    const edge = Math.min(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = edge;
    canvas.height = edge;
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;
    context.drawImage(
      image,
      (image.width - edge) / 2,
      (image.height - edge) / 2,
      edge,
      edge,
      0,
      0,
      edge,
      edge,
    );
    return canvas.toDataURL("image/jpeg", 0.82);
  };

  return (
    <section className="rk-panel" aria-label="Contact details">
      <header className="rk-panel-head">
        <h2 className="rk-heading">Contact details</h2>
        <p className="rk-panel-note">
          The block a recruiter reads first. Blank fields are left out of the sheet.
        </p>
      </header>

      <div className="rk-fields">
        {FIELDS.map((field) => (
          <div key={field.field} className={field.wide ? "rk-field rk-field--wide" : "rk-field"}>
            <label className="rk-label" htmlFor={`contact-${field.field}`}>
              {field.label}
            </label>
            <input
              id={`contact-${field.field}`}
              className="rk-input"
              type={field.type ?? "text"}
              value={contact[field.field]}
              placeholder={field.placeholder}
              onChange={(event) =>
                onChange({ ...contact, [field.field]: event.target.value })
              }
            />
          </div>
        ))}

        <div className="rk-field rk-field--wide">
          <span className="rk-label">Photo</span>
          <div className="rk-photo">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Your portrait" className="rk-photo-preview" />
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="rk-sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try {
                  setPhotoError("");
                  onPhotoChange(await readPhoto(file));
                } catch {
                  setPhotoError("That image could not be read. Try a PNG or JPEG.");
                }
              }}
            />
            <button
              type="button"
              className="rk-btn"
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus size={14} />
              {photoUrl ? "Replace photo" : "Add photo"}
            </button>
            {photoUrl ? (
              <button
                type="button"
                className="rk-btn rk-btn--quiet"
                onClick={() => onPhotoChange(undefined)}
              >
                <Trash2 size={14} />
                Remove
              </button>
            ) : null}
            <span className="rk-panel-note">180 × 180</span>
          </div>
          {photoError ? (
            <p className="rk-error" role="alert">
              {photoError}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}