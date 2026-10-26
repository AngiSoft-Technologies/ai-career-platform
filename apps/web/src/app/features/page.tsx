import { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { FeatureSection } from "@/components/marketing/feature-section";
import {
  Compass,
  ShieldCheck,
  Brain,
  FileText,
  Briefcase,
  HardDrive,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Features — Job Radar",
  description: "Global aggregation, scam detection, AI matching, ATS-ready documents, pipeline tracking, private storage. Every feature built for real job hunting.",
  openGraph: {
    title: "Features — Job Radar",
    description: "Global job search, scam screening, AI-assisted applications. Every feature explained.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar features" }],
  },
};

const FEATURES_DATA = [
  {
    id: "aggregation",
    iconName: "compass",
    title: "Global aggregation",
    subtitle: "One feed from every board",
    text: "We ingest Arbeitnow, RemoteOK, Remotive, Lever, Greenhouse and custom Kenyan portals. Deduplication merges cross-postings. Normalised schema: title, company, location, work mode, seniority, salary, skills, apply URL, source, posted date. Updated every 30 minutes via BullMQ workers.",
    details: [
      "6 live sources, 430+ active roles",
      "30-minute ingestion cycles",
      "Cross-board deduplication",
      "Structured skill extraction",
      "Source health monitoring",
    ],
  },
  {
    id: "security",
    iconName: "shield-check",
    title: "Scam detection first",
    subtitle: "Fingerprint every posting",
    text: "Before you see a role, it passes through: domain age check, SSL validity, company registry lookup, salary median deviation, duplicate fingerprint across boards, keyword scam signatures (crypto, 'work from home packing', upfront fees). Risk score 0–100. >70 = held for moderator review. <20 = safe badge.",
    details: [
      "Domain age + SSL verification",
      "Company registry cross-check",
      "Salary anomaly detection (z-score > 3)",
      "Duplicate fingerprint (SimHash 64-bit)",
      "Keyword signature corpus (200+ patterns)",
      "Moderator review queue with evidence pack",
    ],
  },
  {
    id: "matching",
    iconName: "brain",
    title: "Honest AI matching",
    subtitle: "Skills, location, semantics — one score",
    text: "Your profile (skills, location, work mode, seniority, preferences) generates a 1536-dim embedding. Each opportunity has an embedding. Cosine similarity + structured overlap (skills Jaccard, location exact, seniority band, work mode match) = composite 0–100. No black box — breakdown shown per role. The model only rearranges your facts.",
    details: [
      "Vector similarity (pgvector HNSW)",
      "Structured skill overlap (Jaccard)",
      "Location + work mode exact match",
      "Seniority band alignment",
      "Transparent breakdown per role",
      "Zero hallucination — traces to profile",
    ],
  },
  {
    id: "documents",
    iconName: "file-text",
    title: "ATS-ready documents",
    subtitle: "Three-panel editor, live ATS score",
    text: "Resumonk-inspired editor: left structure tree, center live preview with inline AI suggestions, right ATS score + line diff. Sections: header, summary, experience (STAR bullets), skills, projects, education. Export PDF, DOCX, PPTX, PNG. Version history. ATS score checks: keyword coverage, section completeness, formatting, contact info, quantifiable achievements.",
    details: [
      "Three-panel layout (structure / preview / score)",
      "Inline AI rewrite per bullet (your facts only)",
      "Live ATS score 0–100 with checklist",
      "Line-level diff: added/removed/context",
      "Export: PDF, DOCX, PPTX, PNG",
      "Version history with rollback",
    ],
  },
  {
    id: "tracking",
    iconName: "briefcase",
    title: "Pipeline you own",
    subtitle: "Kanban + follow-ups + reminders",
    text: "Auto-stage from email/webhook: Applied → Screen → Interview → Offer. Manual drag-drop. Notes per stage. Follow-up engine: detects silent periods (>7d), drafts contextual nudge emails, one-click send. Never auto-submits. Calendar sync (ICS). Export pipeline CSV.",
    details: [
      "Auto-stage from email/webhook",
      "Drag-drop Kanban board",
      "Per-stage notes & attachments",
      "Smart follow-up drafts (7/14/30d)",
      "One-click send via BFF proxy",
      "ICS calendar sync",
      "CSV/JSON export",
    ],
  },
  {
    id: "privacy",
    iconName: "hard-drive",
    title: "Private by construction",
    subtitle: "Signed URLs, no training, no sales",
    text: "Documents stored in Neon Object Storage (branchable, per-user buckets). Access via short-lived signed URLs (15 min). Your profile, matches and documents never train models. No third-party analytics. No data sold. GDPR/CCPA delete on request. Self-hostable on your own Neon + Fly.",
    details: [
      "Branchable object storage per user",
      "15-min signed URLs for every download",
      "Zero model training on your data",
      "No third-party analytics/tracking",
      "GDPR/CCPA delete endpoint",
      "Self-hostable (Neon + Fly + Netlify)",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <MarketingLayout>
      <section className="mk-section" style={{ paddingTop: "140px" }} aria-labelledby="features-title">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Features</span>
            <h1 id="features-title" className="mk-heading" style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}>Every feature exists because job hunting is broken</h1>
            <p className="mk-lede">We didn't build a feature list. We fixed the problems job seekers actually face.</p>
          </header>
        </div>
      </section>

      {FEATURES_DATA.map((f, i) => (
        <FeatureSection key={f.id} f={f} index={i} />
      ))}

      <section className="mk-section mk-cta" aria-labelledby="cta-heading">
        <div className="mk-container">
          <h2 id="cta-heading" className="mk-cta__title">See it in action</h2>
          <p className="mk-cta__text">The best way to understand is to try it. Free during founding access.</p>
          <div className="mk-cta__actions">
            <Link href="/download" className="mk-btn mk-btn--primary mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Get the Android APK
            </Link>
            <Link href="/contact" className="mk-btn mk-btn--ghost mk-btn--lg">
              <ExternalLink aria-hidden="true" /> Request a live demo
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}