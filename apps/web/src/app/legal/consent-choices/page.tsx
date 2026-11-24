import Link from "next/link";
import { LegalDocument, type LegalDocumentSection } from "@/components/marketing/legal-document";
import { JsonLd, breadcrumbSchema, webPageSchema } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Consent choices — what you approve on MboQara",
  description:
    "Every MboQara consent decision in one place: matching, AI drafting, application preparation, connected apps and how to withdraw consent.",
  path: "/legal/consent-choices",
  keywords: ["consent choices", "privacy choices", "MboQara consent", "application agent consent"],
});

const SECTIONS: LegalDocumentSection[] = [
  {
    id: "what-this-covers",
    title: "What this page covers",
    body: "This is the consent map for MboQara. It answers what we are allowed to do, what we do only when you ask, and how to change your mind. It is written for the candidate, not for a lawyer: every consent decision below is something you control from your account, your browser, or by contacting the team.",
  },
  {
    id: "profile-matching",
    title: "Profile and job matching",
    body: "You provide your skills, experience, location and work-mode preferences. We use those details to rank live roles and to explain why a role may fit. You can edit any part of your profile at any time. Turning matching off does not delete your profile; it stops new automatic preparation for roles.",
  },
  {
    id: "documents",
    title: "Documents you ask us to prepare",
    body: "MboQara prepares a CV, cover letter or application email only when you ask for a document for a specific role. The draft is built from your own information. You can edit it, ask for another draft, or delete it. We do not submit or share a document from your account unless you explicitly approve it or share it yourself.",
  },
  {
    id: "ai-assistance",
    title: "AI-assisted drafting",
    body: "Some drafting and summarisation features use AI. Your document contents are used to produce the result you requested and to keep the service working. We do not sell your documents, and we do not use them to train third-party AI models. You can always choose to edit a draft yourself instead of using the AI-generated text.",
  },
  {
    id: "application-preparation",
    title: "Application preparation and browser run",
    body: "When you ask MboQara to prepare an application package, we create a package linked to that role and your approved documents. If a paired browser agent is enabled, it only runs after you approve that package. It works only on the employer's application page, sends only the approved pages, and can be stopped or cancelled by you at any time. Nothing is submitted without your explicit request.",
  },
  {
    id: "connected-apps",
    title: "Connected apps and sign-in with MboQara",
    body: "If you use MboQara to connect another app, the consent screen names the app and lists the exact scopes it is requesting. The connection uses only what you approve, expires when MboQara says it expires, and can be revoked from your settings or by the connected app. The connection page is also linked from the footer as App permissions.",
  },
  {
    id: "cookies",
    title: "Browser storage and cookies",
    body: "Your browser stores a sign-in cookie, your theme, a page cache and an offline action queue. No advertising cookies or cross-site trackers are set. The cookie notice lists every item we know this site stores. You can clear it in your browser; signing out removes these entries.",
  },
  {
    id: "withdraw",
    title: "Changing your mind",
    body: "You can withdraw consent at any time. Remove connected providers, clear offline actions, turn off automatic preparation, or edit your profile. To delete an account, request a copy of your data, or ask what we hold, contact privacy@angisoft.co.ke from your registered email. We act on verifiable requests and tell you when the work is done.",
  },
];

export default function ConsentChoicesPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "Consent choices — MboQara",
            description:
              "The consent map for matching, AI drafting, application preparation, connected apps, browser storage and how to withdraw consent.",
            path: "/legal/consent-choices",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Legal", path: "/legal" },
            { name: "Consent choices", path: "/legal/consent-choices" },
          ]),
        ]}
      />
      <LegalDocument
        eyebrow="Consent choices"
        title="You approve the role, the documents and the send"
        intro="MboQara prepares and organises; it does not apply for you without you. This page lists the places where your approval is required and how to withdraw it."
        sections={SECTIONS}
        related={[
          { href: "/privacy", label: "Privacy Policy" },
          { href: "/terms", label: "Terms of Service" },
          { href: "/cookies", label: "Cookie notice" },
          { href: "/contact", label: "Contact" },
        ]}
      >
        <div className="mk-panel mt-7 grid gap-2.5 p-5 lg:px-5.5">
          <h2 className="mk-legal__section-title" style={{ fontSize: "1.05rem" }}>
            Where your approval is required
          </h2>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.1rem",
              display: "grid",
              gap: "8px",
              color: "var(--mk-text-soft)",
              fontSize: "0.92rem",
              lineHeight: 1.6,
            }}
          >
            <li>Before a tailored CV, cover letter or application email is prepared for a role.</li>
            <li>Before a prepared package is marked approved and made available to a paired browser agent.</li>
            <li>Before any application form is filled, documents are uploaded, or an application is sent.</li>
            <li>Before another app is connected to your MboQara account.</li>
          </ul>
          <p className="mk-legal__text" style={{ marginTop: "0.35rem" }}>
            Read the{" "}
            <Link className="mk-link" href="/legal">
              legal page index
            </Link>{" "}
            for the full document set.
          </p>
        </div>
      </LegalDocument>
    </>
  );
}