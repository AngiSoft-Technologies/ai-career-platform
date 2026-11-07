import type { ReactNode } from "react";

/**
 * Questions, answered without a script.
 *
 * `<details>` is the accordion the platform already has: keyboard
 * operable, screen-reader legible, and it works before hydration. The
 * marker is a CSS chevron, so nothing flashes on load.
 */
export function Faq({ items, label }: { items: Array<{ q: string; a: ReactNode }>; label: string }) {
  return (
    <div className="mk-faq" aria-label={label}>
      {items.map((item) => (
        <details key={item.q} className="mk-faq__item">
          <summary className="mk-faq__q">{item.q}</summary>
          <div className="mk-faq__a">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

/**
 * The band every page ends on.
 *
 * One conversion, stated plainly, with the two doors side by side — the
 * app and the web — because a visitor who has read this far has already
 * decided which door they came through.
 */
export function CtaBand({
  title,
  text,
  primary,
  secondary,
}: {
  title: string;
  text: string;
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <section className="mk-section" aria-label={title}>
      <div className="mk-container">
        <div className="mk-cta grid justify-items-center gap-[1.125rem] p-10 lg:px-12 lg:py-18">
          <span className="mk-eyebrow mk-eyebrow--signal">
            <span className="mk-eyebrow__rule" aria-hidden="true" />
            Start where you are
          </span>
          <h2 className="mk-display mk-display--sm max-w-prose">
            {title}
          </h2>
          <p className="mk-lede max-w-prose-wide" style={{ margin: 0 }}>
            {text}
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-1.5">
            {primary}
            {secondary}
          </div>
        </div>
      </div>
    </section>
  );
}
