import type { ReactNode } from "react";

/**
 * A story spine.
 *
 * The about page is a story about why the product exists, and a story
 * needs a line to hang on. Dates sit in their own column, the spine runs
 * through the marks rather than the text, and the mark takes the tone of
 * what happened — amber for a decision, green for something proven.
 */
export function Timeline({
  items,
  label,
}: {
  items: Array<{ when: string; title: string; text: string; tone?: "signal" | "verified" | "insight" }>;
  label: string;
}) {
  return (
    <ol className="mk-timeline" aria-label={label} style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item) => (
        <li
          key={item.when + item.title}
          className={`mk-timeline__item${item.tone && item.tone !== "insight" ? ` mk-timeline__item--${item.tone}` : ""}`}
        >
          <span className="mk-timeline__when mk-numeral">{item.when}</span>
          <span className="mk-timeline__marker" aria-hidden="true" />
          <div className="mk-timeline__body">
            <h3 className="mk-timeline__title">{item.title}</h3>
            <p className="mk-timeline__text">{item.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A pull quote with attribution. */
export function Quote({ text, name, role }: { text: string; name: string; role: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  return (
    <figure className="mk-quote" style={{ margin: 0 }}>
      <blockquote className="mk-quote__text" style={{ margin: 0 }}>
        {text}
      </blockquote>
      <figcaption className="mk-quote__who">
        <span className="mk-quote__avatar mk-numeral" aria-hidden="true">
          {initials}
        </span>
        <span>
          <span className="mk-quote__name" style={{ display: "block" }}>
            {name}
          </span>
          <span className="mk-quote__role">{role}</span>
        </span>
      </figcaption>
    </figure>
  );
}

/** A definition list used for facts: offices, channels, response times. */
export function FactList({
  items,
  label,
}: {
  items: Array<{ term: string; detail: ReactNode }>;
  label: string;
}) {
  return (
    <dl aria-label={label} className="grid m-0">
      {items.map((item) => (
        <div
          key={item.term}
          className="flex flex-wrap justify-between gap-1.5 gap-x-5 py-3.5 border-b border-hairline"
        >
          <dt className="text-[0.88rem] text-text-muted">{item.term}</dt>
          <dd className="m-0 text-[0.9rem] font-semibold text-text text-right">
            {item.detail}
          </dd>
        </div>
      ))}
    </dl>
  );
}
