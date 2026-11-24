import Link from "next/link";
import { LegalDocument, type LegalDocumentSection } from "@/components/marketing/legal-document";
import { JsonLd, breadcrumbSchema, webPageSchema } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Legal and policies — MboQara",
  description:
    "Every MboQara policy in one place: privacy, terms, consent choices, acceptable use, cookies, security, accessibility and contact.",
  path: "/legal",
  keywords: ["MboQara legal", "job platform policies", "privacy terms cookies"],
});

const SECTIONS: LegalDocumentSection[] = [
  {
    id: "how-to-read",
    title: "How to read these documents",
    body: "These policies are written in plain English, but they are still policies: they set out what you can expect from MboQara and what we ask from you. If anything here is unclear, ask through the contact page and we will explain it. Nothing here limits the approvals you explicitly give when you prepare or submit an application.",
  },
  {
    id: "order",
    title: "The order to read them in",
    body: "Read the Terms first for how the service works, then Privacy for how your information is handled. Read Consent choices if you want to know every place where your approval matters, and the Cookie notice if you care about what stays in your browser.",
  },
];

const LEGAL_DOCUMENTS: Array<{ href: string; title: string; description: string }> = [
  {
    href: "/terms",
    title: "Terms of Service",
    description: "How the beta service works, what we promise, and what we do not promise.",
  },
  {
    href: "/privacy",
    title: "Privacy Policy",
    description: "What information we hold, why, who processes it, and how you can control it.",
  },
  {
    href: "/legal/consent-choices",
    title: "Consent choices",
    description: "Every point where you approve something, and how to withdraw that approval.",
  },
  {
    href: "/legal/acceptable-use",
    title: "Acceptable use",
    description: "Rules for honest applications, account security, AI use and reporting vulnerabilities.",
  },
  {
    href: "/cookies",
    title: "Cookie notice",
    description: "Everything this site stores in your browser, item by item.",
  },
  {
    href: "/security",
    title: "Security",
    description: "How accounts, documents and data are protected.",
  },
  {
    href: "/accessibility",
    title: "Accessibility statement",
    description: "Our WCAG target, what is in place today, and how to report a barrier.",
  },
];

export default function LegalIndexPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "Legal and policies — MboQara",
            description:
              "MboQara legal index: Terms, Privacy Policy, Consent choices, Acceptable use, Cookie notice, Security, Accessibility.",
            path: "/legal",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Legal", path: "/legal" },
          ]),
        ]}
      />
      <LegalDocument
        eyebrow="Legal"
        title="Every policy, in one place"
        intro="MboQara prepares; you decide. These documents describe both sides of that promise: what the service does with your information, and what it never does without your approval."
        sections={SECTIONS}
        related={[
          { href: "/contact", label: "Contact the team" },
          { href: "/faq", label: "FAQ" },
        ]}
      >
        <div className="mk-panel mt-7 grid gap-3.5 p-5 lg:px-5.5">
          <h2 className="mk-legal__section-title" style={{ fontSize: "1.05rem" }}>
            The documents
          </h2>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "12px" }}>
            {LEGAL_DOCUMENTS.map((document) => (
              <li key={document.href} style={{ borderTop: "1px solid var(--mk-border)", paddingTop: "10px" }}>
                <Link className="mk-link" href={document.href} style={{ fontWeight: 600 }}>
                  {document.title}
                </Link>
                <p style={{ margin: "0.25rem 0 0", color: "var(--mk-text-soft)", fontSize: "0.92rem", lineHeight: 1.55 }}>
                  {document.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </LegalDocument>
    </>
  );
}