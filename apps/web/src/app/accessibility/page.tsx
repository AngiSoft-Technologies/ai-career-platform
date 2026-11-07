import Link from "next/link";
import { MarketingLayout } from "@/components/marketing/layout";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, breadcrumbSchema, webPageSchema } from "@/components/seo/json-ld";
import { Accessibility } from "lucide-react";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Accessibility — MboQara's commitment and known limitations",
  description:
    "MboQara targets WCAG 2.2 AA. What is in place — keyboard operation, contrast, reduced motion, alt text — the limitations we know about, and how to report a barrier.",
  path: "/accessibility",
  keywords: ["accessibility statement", "WCAG 2.2", "MboQara accessibility"],
});

interface LegalSection {
  id: string;
  title: string;
  body: string;
}

const SECTIONS: LegalSection[] = [
  {
    id: "commitment",
    title: "The commitment",
    body: "MboQara is built for job seekers — many of whom are using a phone, on a slow connection, with the screen brightness down to save battery. An interface that only works with a mouse, a fast connection and good eyesight excludes the exact people this product exists for. We target WCAG 2.2 level AA and treat a reported barrier as a bug, not a feature request.",
  },
  {
    id: "in-place",
    title: "What is in place",
    body: "The site is operable by keyboard throughout, with visible focus states and skip links. Layout responds from small phones upward without horizontal scrolling. Colour is never the only way information is conveyed — a match score, an eligibility answer and a risk flag all carry text as well as colour. Images that carry meaning have alt text; decoration is marked so it is skipped. Interactive controls are real buttons and links, so they work with assistive technology.",
  },
  {
    id: "motion",
    title: "Motion, contrast and text",
    body: "Everything animated on the site — scroll reveals, counting statistics, carousels — settles into its final state when the operating system asks for reduced motion, and carousels can be paused, stepped with the keyboard, and navigated with arrows. Body text is set at a size you can zoom to 200% in the browser without losing content, and the interface keeps its contrast on dark backgrounds rather than going grey-on-grey.",
  },
  {
    id: "offline",
    title: "Offline and low-bandwidth behaviour",
    body: "The Android app keeps applications and documents available without a connection and syncs later, which is an accessibility feature as much as a resilience one — a candidate on a metered connection should not lose an afternoon's work to a dropped signal. The web app caches the pages it has opened for the same reason.",
  },
  {
    id: "limitations",
    title: "Known limitations, stated plainly",
    body: "Some older pages inside the app are still catching up: a few forms have labels that are visually implied rather than programmatically associated, some tables in the admin surfaces are wide enough to need horizontal scrolling on a phone, and the marketing photography relies on captions that not every screen reader reaches. Work on these is ongoing and tracked like any other bug.",
  },
  {
    id: "reporting",
    title: "Report a barrier",
    body: "Tell us what you were trying to do, what happened, and what you were using — a browser and version is enough, and a screen reader name helps. Barriers are fixed in priority order alongside functional bugs. Write through the contact page or email us directly; you will get a human reply and, where a fix takes time, an honest timeline rather than silence.",
  },
];

export default function AccessibilityPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "Accessibility — MboQara",
            description:
              "MboQara's accessibility commitment: WCAG 2.2 AA target, what is in place today, known limitations, and how to report a barrier.",
            path: "/accessibility",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Accessibility", path: "/accessibility" },
          ]),
        ]}
      />
      <MarketingLayout>
        <section className="mk-section mk-legal" aria-labelledby="a11y-title">
          <div className="mk-container mk-grid mk-grid--2 gap-12 items-start">
            <aside className="mk-legal__toc">
              <nav className="mk-legal__toc-inner">
                <h3 className="mk-legal__toc-title">
                  <Accessibility size={14} aria-hidden="true" className="align-[-2px] mr-1.5" />
                  On this page
                </h3>
                <ul className="mk-legal__toc-list">
                  {SECTIONS.map((section) => (
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
                Accessibility
              </span>
              <h1 id="a11y-title" className="mk-legal__section-title">
                Usable by everyone who needs a job, not only by everyone with a mouse
              </h1>
              <p className="mk-legal__text">
                MboQara targets WCAG 2.2 level AA. This page states what is in place, what is not, and how to
                reach us when something gets in your way.
              </p>

              {SECTIONS.map((section) => (
                <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
                  <h2 className="mk-legal__section-title" id={`${section.id}-title`}>
                    {section.title}
                  </h2>
                  <p className="mk-legal__text">{section.body}</p>
                </section>
              ))}

              <p className="mk-legal__text mt-6">
                Related: the{" "}
                <Link className="mk-link" href="/security">
                  security page
                </Link>{" "}
                describes how the trust engine protects candidates, and the{" "}
                <Link className="mk-link" href="/contact">
                  contact page
                </Link>{" "}
                is the fastest way to report a barrier.
              </p>
            </article>
          </div>
        </section>
      </MarketingLayout>
    </>
  );
}
