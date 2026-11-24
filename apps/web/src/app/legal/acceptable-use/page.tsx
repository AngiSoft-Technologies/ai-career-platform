import { LegalDocument, type LegalDocumentSection } from "@/components/marketing/legal-document";
import { JsonLd, breadcrumbSchema, webPageSchema } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Acceptable use — how to use MboQara responsibly",
  description:
    "The rules for using MboQara: keep your account secure, provide accurate information, follow employer application rules, and do not misuse AI or automated features.",
  path: "/legal/acceptable-use",
  keywords: ["acceptable use policy", "MboQara rules", "AI misuse", "account abuse"],
});

const SECTIONS: LegalDocumentSection[] = [
  {
    id: "rule",
    title: "The rule in one line",
    body: "Use MboQara for your own job search, on the employers' own terms, with the truth on your application. If a use would mislead an employer, abuse the platform, or break the law where you are, it is not acceptable here.",
  },
  {
    id: "account-security",
    title: "Your account and security",
    body: "Keep your credentials and your browser-agent pairing token out of other people's hands. If you lose a device, revoke its pairing and connected apps. You may use one account for yourself; sharing an account so that many people act as one candidate is not allowed.",
  },
  {
    id: "accurate-information",
    title: "Accurate profile information",
    body: "Your profile, documents and answers should describe your own experience. MboQara can draft and shape text, but it cannot invent qualifications. We do not accept resumes or applications that falsify employment, education, licences, references, identity or right-to-work status.",
  },
  {
    id: "employers",
    title: "Following employer application rules",
    body: "Employers own their application systems. Apply within the limits each employer states: one application per vacancy, no misrepresented submissions, no automated flooding, no attempts to bypass paywalls or eligibility checks, and no interference with another candidate's application.",
  },
  {
    id: "ai-use",
    title: "Using AI and automation carefully",
    body: "AI drafts are a starting point, not a final answer. Review generated documents, answers, summaries and eligibility conclusions before you rely on them or send them to an employer. Do not try to trick, benchmark, or overload our AI services, scrape private data, reverse engineer the platform, or use access tokens beyond your own account.",
  },
  {
    id: "security-reports",
    title: "Reporting a vulnerability",
    body: "If you find a security problem, report it privately to mboqara@angisoft.co.ke with enough detail for us to reproduce it. Good-faith research that does not expose other people's data, disrupt service, or demand payment is welcome. Do not test against other users' accounts without written permission.",
  },
  {
    id: "enforcement",
    title: "If these rules are broken",
    body: "We may suspend features or accounts that are used for abuse, fraud, unlawful applications, scraping or interference, and we may preserve records where required by law. We will usually tell you why when it is safe to do so. A serious or repeated violation may end your ability to use the service.",
  },
];

export default function AcceptableUsePage() {
  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "Acceptable use — MboQara",
            description:
              "MboQara acceptable use rules: secure accounts, accurate information, lawful and honest applications, responsible AI use, and private vulnerability reporting.",
            path: "/legal/acceptable-use",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Legal", path: "/legal" },
            { name: "Acceptable use", path: "/legal/acceptable-use" },
          ]),
        ]}
      />
      <LegalDocument
        eyebrow="Acceptable use"
        title="Honest applications, safe use, no tricks"
        intro="MboQara exists to help you present your real experience clearly. These rules protect you, the employers you approach, and everyone else using the platform."
        sections={SECTIONS}
        related={[
          { href: "/terms", label: "Terms of Service" },
          { href: "/legal/consent-choices", label: "Consent choices" },
          { href: "/security", label: "Security" },
          { href: "/contact", label: "Contact" },
        ]}
      />
    </>
  );
}