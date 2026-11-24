import type { ReactNode } from "react";
import { MarketingLayout } from "./layout";

export interface LegalDocumentSection {
  id: string;
  title: string;
  body: string;
}

export interface LegalDocumentRelatedLink {
  href: string;
  label: string;
}

interface LegalDocumentProps {
  eyebrow: string;
  title: string;
  intro: string;
  sections: LegalDocumentSection[];
  /** Optional links to related policies, rendered as a paragraph at the end. */
  related?: LegalDocumentRelatedLink[];
  /** Optional index or callout content rendered between sections and related links. */
  children?: ReactNode;
}

/**
 * One layout for the standalone legal pages.
 *
 * Privacy, terms and the cookie notice each own their long-form copy because
 * they fetch it from the API, but the newer standalone policies are static in
 * the repo and share this presentation.
 */
export function LegalDocument({
  eyebrow,
  title,
  intro,
  sections,
  related = [],
  children,
}: LegalDocumentProps) {
  return (
    <MarketingLayout>
      <section className="mk-section mk-legal pt-[140px]" aria-labelledby="legal-title">
        <div className="mk-container mk-grid mk-grid--2 gap-12 items-start">
          <aside className="mk-legal__toc">
            <nav className="mk-legal__toc-inner">
              <h3 className="mk-legal__toc-title">On this page</h3>
              <ul className="mk-legal__toc-list">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a className="mk-legal__toc-link" href={`#${section.id}`}>
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article className="mk-legal__content">
            <span className="mk-eyebrow mk-eyebrow--verified mb-3.5">
              <span className="mk-eyebrow__rule" aria-hidden="true" />
              {eyebrow}
            </span>
            <h1 id="legal-title" className="mk-legal__section-title">
              {title}
            </h1>
            <p className="mk-legal__text">{intro}</p>

            {sections.map((section) => (
              <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
                <h2 className="mk-legal__section-title" id={`${section.id}-title`}>
                  {section.title}
                </h2>
                <p className="mk-legal__text">{section.body}</p>
              </section>
            ))}

            {children}

            {related.length > 0 ? (
              <p className="mk-legal__text mt-6">
                Related:{" "}
                {related.map((link, index) => (
                  <span key={link.href}>
                    {index > 0 ? " · " : ""}
                    <a className="mk-link" href={link.href}>
                      {link.label}
                    </a>
                  </span>
                ))}
              </p>
            ) : null}
          </article>
        </div>
      </section>
    </MarketingLayout>
  );
}