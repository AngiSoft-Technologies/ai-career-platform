import Link from "next/link";
import { MarketingLayout } from "@/components/marketing/layout";
import { Reveal } from "@/components/marketing/reveal";
import { VideoHero } from "@/components/marketing/video-hero";
import { Stats } from "@/components/marketing/stats";
import { Slider } from "@/components/marketing/slider";
import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  FileText,
  Briefcase,
  Globe,
  Check,
  Zap,
  Compass,
  Layers,
  Search,
  Users,
  Brain,
  HardDrive,
  Smartphone,
  Download,
  ExternalLink,
  BadgeCheck,
  Radar,
  Timer,
  FileCheck2,
} from "lucide-react";

export const metadata = {
  title: "Job Radar — Every Job. One Honest Search.",
  description:
    "AI-powered global job search. 430+ live roles, 195 professions, scam screening, ATS-ready documents. AI prepares, you decide, you submit.",
  openGraph: {
    title: "Job Radar",
    description:
      "All jobs under one roof. Global coverage, every profession, AI-assisted applications you control.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Job Radar",
    description: "All jobs under one roof — global coverage, every profession.",
    images: ["/media/og-cover.jpg"],
  },
};

const FEATURES = [
  {
    icon: Compass,
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
    href: "/features#aggregation",
  },
  {
    id: "security",
    icon: ShieldCheck,
    title: "Scam detection first",
    subtitle: "Fingerprint every posting",
    text: "Before you see a role, it passes through: domain age check, SSL validity, company registration lookup, salary median deviation, duplicate fingerprint across boards, keyword scam signatures (crypto, 'work from home packing', upfront fees). Risk score 0–100. >70 = held for moderator review. <20 = safe badge.",
    details: [
      "Domain age + SSL verification",
      "Company registry cross-check",
      "Salary anomaly detection (z-score > 3)",
      "Duplicate fingerprint (SimHash 64-bit)",
      "Keyword signature corpus (200+ patterns)",
      "Moderator review queue with evidence pack",
    ],
    href: "/features#security",
  },
  {
    id: "matching",
    icon: Brain,
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
    href: "/features#matching",
  },
  {
    id: "documents",
    icon: FileText,
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
    href: "/features#documents",
  },
  {
    id: "tracking",
    icon: Briefcase,
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
    href: "/features#tracking",
  },
  {
    id: "privacy",
    icon: HardDrive,
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
    href: "/features#privacy",
  },
];

const ROLES = [
  {
    icon: Users,
    name: "Job Seeker",
    theme: "Aurora",
    desc: "Your personal radar — matches, documents, pipeline, follow-ups.",
    features: ["Ranked daily matches", "ATS-ready CV & cover letter", "Application tracker", "Follow-up reminders"],
  },
  {
    icon: Search,
    name: "Analyst",
    theme: "Editorial",
    desc: "Market intelligence — trends, salary bands, skill gaps, company maps.",
    features: ["Trend dashboards", "Salary benchmarking", "Skill gap analysis", "Exportable reports"],
  },
  {
    icon: Zap,
    name: "Automation",
    theme: "Terminal",
    desc: "Workflows that run while you sleep — ingestion, enrichment, alerts, exports.",
    features: ["Scheduled ingestions", "Webhook integrations", "Custom pipelines", "Audit logs"],
  },
  {
    icon: ShieldCheck,
    name: "Moderator",
    theme: "Kinetic",
    desc: "Platform integrity — scam queue, duplicate merge, source health, policy enforcement.",
    features: ["Scam review queue", "Source health monitor", "Duplicate resolver", "Policy controls"],
  },
  {
    icon: Users,
    name: "Support",
    theme: "Atlas",
    desc: "User success — ticketing, onboarding insights, feature requests, escalation paths.",
    features: ["Ticket dashboard", "Onboarding metrics", "Feedback triage", "SLA tracking"],
  },
];

const STEPS = [
  { num: "01", title: "The radar", text: "Hundreds of boards, ATS feeds and local portals scanned continuously." },
  { num: "02", title: "The filter", text: "Scam fingerprints, salary checks and duplicate detection clear the noise." },
  { num: "03", title: "The match", text: "Skills, location, work mode and semantics combined into one honest score." },
  { num: "04", title: "The kit", text: "An ATS-ready CV and cover letter built from your profile, not from a template." },
  { num: "05", title: "You apply", text: "The form is prepared, you review it, you press submit. We track what happens next." },
];

const SLIDER_PANELS = [
  {
    title: "Your feed",
    desc: "A single chronological stream. Filters for role, location, work mode, seniority, source. Save, hide, share.",
    mock: (
      <div className="mk-frame" style={{ maxWidth: "720px" }}>
        <div className="mk-frame__bar">
          <div className="mk-frame__dots"><span className="mk-frame__dot" /><span className="mk-frame__dot" /><span className="mk-frame__dot" /></div>
          <span className="mk-frame__title">Opportunities</span>
          <div className="mk-frame__dots" />
        </div>
        <div className="mk-frame__content">
          <div className="mk-mock-list">
            <div className="mk-mock-card">
              <div className="mk-mock-card__avatar">JR</div>
              <div className="mk-mock-card__info">
                <div className="mk-mock-card__title">Senior React Engineer — Vercel</div>
                <div className="mk-mock-card__meta"><span>Remote</span><span>🧭 94% match</span><span>Posted 2h ago</span></div>
              </div>
              <div className="mk-mock-card__actions">
                <button className="mk-mock-btn" aria-label="Save"><Sparkles className="mk-mock-btn-icon" /></button>
                <button className="mk-mock-btn" aria-label="Apply"><ArrowRight className="mk-mock-btn-icon" /></button>
              </div>
            </div>
            <div className="mk-mock-card">
              <div className="mk-mock-card__avatar">JR</div>
              <div className="mk-mock-card__info">
                <div className="mk-mock-card__title">Data Scientist — Stripe</div>
                <div className="mk-mock-card__meta"><span>San Francisco</span><span>🧭 87% match</span><span>Posted 5h ago</span></div>
              </div>
              <div className="mk-mock-card__actions">
                <button className="mk-mock-btn" aria-label="Save"><Sparkles className="mk-mock-btn-icon" /></button>
                <button className="mk-mock-btn" aria-label="Apply"><ArrowRight className="mk-mock-btn-icon" /></button>
              </div>
            </div>
            <div className="mk-mock-card">
              <div className="mk-mock-card__avatar">JR</div>
              <div className="mk-mock-card__info">
                <div className="mk-mock-card__title">Product Designer — Linear</div>
                <div className="mk-mock-card__meta"><span>Remote</span><span>🧭 91% match</span><span>Posted 1d ago</span></div>
              </div>
              <div className="mk-mock-card__actions">
                <button className="mk-mock-btn" aria-label="Save"><Sparkles className="mk-mock-btn-icon" /></button>
                <button className="mk-mock-btn" aria-label="Apply"><ArrowRight className="mk-mock-btn-icon" /></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Match score",
    desc: "Transparent breakdown — skills overlap, location fit, seniority alignment, semantic similarity. No black box.",
    mock: (
      <div className="mk-frame" style={{ maxWidth: "720px" }}>
        <div className="mk-frame__bar">
          <div className="mk-frame__dots"><span className="mk-frame__dot" /><span className="mk-frame__dot" /><span className="mk-frame__dot" /></div>
          <span className="mk-frame__title">Match breakdown</span>
          <div className="mk-frame__dots" />
        </div>
        <div className="mk-frame__content" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          <div className="mk-mock-card" style={{ flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--mk-success)" }}>94%</div>
            <div className="mk-text-muted" style={{ fontSize: "0.8rem" }}>Overall match</div>
          </div>
          <div className="mk-mock-card" style={{ flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>9/10</div>
            <div className="mk-text-muted" style={{ fontSize: "0.8rem" }}>Skills overlap</div>
          </div>
          <div className="mk-mock-card" style={{ flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>✓</div>
            <div className="mk-text-muted" style={{ fontSize: "0.8rem" }}>Location fit</div>
          </div>
          <div className="mk-mock-card" style={{ flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>88%</div>
            <div className="mk-text-muted" style={{ fontSize: "0.8rem" }}>Semantic sim.</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Document editor",
    desc: "Three-panel Resumonk-style editor. Left: structure. Center: live preview with inline AI suggestions. Right: ATS score + line diff.",
    mock: (
      <div className="mk-editor-preview">
        <div className="mk-editor-panel mk-editor-panel--left">
          <div className="mk-editor-panel__header">Structure</div>
          <div className="mk-editor-panel__body">
            <div className="mk-mock-card"><Sparkles className="mk-mock-card__avatar" /><div><div className="mk-mock-card__title">Header</div><div className="mk-mock-card__meta">Name, title, links</div></div></div>
            <div className="mk-mock-card"><Sparkles className="mk-mock-card__avatar" /><div><div className="mk-mock-card__title">Summary</div><div className="mk-mock-card__meta">AI-generated, editable</div></div></div>
            <div className="mk-mock-card"><Sparkles className="mk-mock-card__avatar" /><div><div className="mk-mock-card__title">Experience</div><div className="mk-mock-card__meta">3 roles, bullet points</div></div></div>
            <div className="mk-mock-card"><Sparkles className="mk-mock-card__avatar" /><div><div className="mk-mock-card__title">Skills</div><div className="mk-mock-card__meta">18 mapped, 94% coverage</div></div></div>
            <div className="mk-mock-card"><Sparkles className="mk-mock-card__avatar" /><div><div className="mk-mock-card__title">Projects</div><div className="mk-mock-card__meta">2 featured</div></div></div>
          </div>
        </div>
        <div className="mk-editor-panel">
          <div className="mk-editor-panel__header">Live preview</div>
          <div className="mk-editor-panel__body" style={{ fontFamily: "var(--font-body)", lineHeight: 1.7, color: "var(--mk-text)" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.4rem" }}>Jane Doe</h2>
            <p style={{ margin: "0 0 16px", color: "var(--mk-accent)" }}>Senior React Engineer — Remote</p>
            <p style={{ margin: "0 0 16px" }}>Building accessible, performant web apps for 7+ years. Led migration to Next.js 14, cutting bundle 42%.</p>
            <h3 style={{ margin: "16px 0 8px", fontSize: "1rem" }}>Experience</h3>
            <p style={{ margin: "0 0 4px" }}><strong>Vercel</strong> — Senior Engineer <span style={{ color: "var(--mk-text-muted)" }}>2022–Present</span></p>
            <p style={{ margin: "0 0 4px", fontSize: "0.9rem" }}>• Shipped Edge Functions, reduced cold starts 60%</p>
            <p style={{ margin: "0 0 4px", fontSize: "0.9rem" }}>• Mentored 4 engineers, ran interview loop</p>
          </div>
        </div>
        <div className="mk-editor-panel mk-editor-panel--right">
          <div className="mk-editor-panel__header">ATS Score</div>
          <div className="mk-editor-panel__body">
            <div className="mk-ats-score">
              <div className="mk-ats-score__value">94</div>
              <div className="mk-ats-score__label">ATS compatibility</div>
            </div>
            <div style={{ borderTop: "1px solid var(--mk-border)", paddingTop: "16px" }}>
              <div className="mk-diff-line mk-diff-line--added">+ Added "Next.js 14" to skills</div>
              <div className="mk-diff-line mk-diff-line--removed">- Removed "React.js" (implied)</div>
              <div className="mk-diff-line mk-diff-line--context">  Experience: Vercel (2022–Present)</div>
              <div className="mk-diff-line mk-diff-line--added">+ Quantified bundle reduction: 42%</div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Pipeline",
    desc: "Kanban board — Applied, Screen, Interview, Offer. Auto-stage from email/webhook. Follow-up reminders. Notes per stage.",
    mock: (
      <div className="mk-frame" style={{ maxWidth: "720px" }}>
        <div className="mk-frame__bar">
          <div className="mk-frame__dots"><span className="mk-frame__dot" /><span className="mk-frame__dot" /><span className="mk-frame__dot" /></div>
          <span className="mk-frame__title">Applications</span>
          <div className="mk-frame__dots" />
        </div>
        <div className="mk-frame__content">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
            {["Applied", "Screen", "Interview", "Offer"].map((col, i) => (
              <div key={col} className="mk-mock-card" style={{ flexDirection: "column", minHeight: "280px" }}>
                <div style={{ fontWeight: 700, marginBottom: "12px", display: "flex", justifyContent: "space-between" }}>
                  <span>{col}</span>
                  <span style={{ background: "var(--mk-accent-soft)", color: "var(--mk-accent)", padding: "2px 8px", borderRadius: "999px", fontSize: "0.7rem" }}>{[3, 2, 1, 1][i]}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="mk-mock-card" style={{ padding: "10px", fontSize: "0.78rem" }}>
                      <div className="mk-mock-card__title" style={{ fontSize: "0.8rem" }}>Role at Company {j + 1}</div>
                      <div className="mk-mock-card__meta" style={{ fontSize: "0.65rem" }}><span>{["2d ago", "5d ago", "1w ago"][j]}</span><span>{["Remote", "NYC", "London"][j]}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Scam shield",
    desc: "Real-time risk score on every card. Flagged postings never reach your feed. Review queue for moderators with evidence pack.",
    mock: (
      <div className="mk-frame" style={{ maxWidth: "720px" }}>
        <div className="mk-frame__bar">
          <div className="mk-frame__dots"><span className="mk-frame__dot" /><span className="mk-frame__dot" /><span className="mk-frame__dot" /></div>
          <span className="mk-frame__title">Risk analysis</span>
          <div className="mk-frame__dots" />
        </div>
        <div className="mk-frame__content">
          <div className="mk-mock-list">
            <div className="mk-mock-card" style={{ borderColor: "var(--mk-danger)", background: "rgba(251,113,133,0.06)" }}>
              <div className="mk-mock-card__avatar" style={{ background: "var(--mk-danger-soft)", color: "var(--mk-danger)" }}><ShieldCheck /></div>
              <div className="mk-mock-card__info">
                <div className="mk-mock-card__title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>Fake recruiter phishing <span style={{ background: "var(--mk-danger-soft)", color: "var(--mk-danger)", padding: "2px 8px", borderRadius: "999px", fontSize: "0.65rem" }}>BLOCKED</span></div>
                <div className="mk-mock-card__meta"><span>Risk: 94/100</span><span>Salary anomaly</span><span>Domain age: 4 days</span></div>
              </div>
            </div>
            <div className="mk-mock-card">
              <div className="mk-mock-card__avatar" style={{ background: "var(--mk-warning-soft)", color: "var(--mk-warning)" }}><ShieldCheck /></div>
              <div className="mk-mock-card__info">
                <div className="mk-mock-card__title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>Suspicious listing <span style={{ background: "var(--mk-warning-soft)", color: "var(--mk-warning)", padding: "2px 8px", borderRadius: "999px", fontSize: "0.65rem" }}>REVIEW</span></div>
                <div className="mk-mock-card__meta"><span>Risk: 67/100</span><span>Duplicate across 3 boards</span></div>
              </div>
            </div>
            <div className="mk-mock-card">
              <div className="mk-mock-card__avatar" style={{ background: "var(--mk-success-soft)", color: "var(--mk-success)" }}><ShieldCheck /></div>
              <div className="mk-mock-card__info">
                <div className="mk-mock-card__title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>Verified employer <span style={{ background: "var(--mk-success-soft)", color: "var(--mk-success)", padding: "2px 8px", borderRadius: "999px", fontSize: "0.65rem" }}>SAFE</span></div>
                <div className="mk-mock-card__meta"><span>Risk: 12/100</span><span>Company age: 12 yrs</span><span>SSL valid</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
];

const FEATURES_LANDING = [
  {
    icon: Compass,
    title: "Global aggregation",
    body: "Hundreds of boards, ATS feeds and local portals across 40+ countries normalised into one feed.",
    href: "/features#aggregation",
  },
  {
    icon: ShieldCheck,
    title: "Scam detection first",
    body: "Every posting fingerprinted against salary medians, company history and duplicate patterns before you see it.",
    href: "/features#security",
  },
  {
    icon: Brain,
    title: "Honest AI matching",
    body: "Skills, location, work mode and semantics combined into one score. The model only rearranges your facts.",
    href: "/features#matching",
  },
  {
    icon: FileText,
    title: "ATS-ready documents",
    body: "CV, cover letter and portfolio in one editor. Live ATS score. Export PDF, DOCX, PPTX, PNG.",
    href: "/features#documents",
  },
  {
    icon: Briefcase,
    title: "Pipeline you own",
    body: "We detect the employer's form, draft every answer, track status and remind you to follow up. Zero auto-submits.",
    href: "/features#tracking",
  },
  {
    icon: HardDrive,
    title: "Private by construction",
    body: "Documents in private storage behind signed URLs. Your data trains nothing and is never sold.",
    href: "/features#privacy",
  },
];

const SOURCES = [
  { name: "Arbeitnow", roles: 302 },
  { name: "RemoteOK", roles: 100 },
  { name: "Remotive", roles: 12 },
  { name: "Lever", roles: 1 },
  { name: "Greenhouse", roles: 1 },
  { name: "Custom feeds", roles: 17 },
];

export default function LandingPage() {
  return (
    <MarketingLayout>
      <section className="mk-hero" aria-labelledby="hero-title">
        <VideoHero
          poster="/media/radar-poster.jpg"
          videoSrc="/media/radar-loop.mp4"
          className="mk-hero__video-hero"
        >
          <div className="mk-hero__inner">
            <div className="mk-hero__copy">
              <div className="mk-hero__eyebrow">
                <Sparkles className="mk-hero__eyebrow-icon" aria-hidden="true" />
                <span>AI career platform · AngiSoft Technologies</span>
              </div>
              <h1 id="hero-title" className="mk-heading">
                Every job. One honest search.
              </h1>
              <p className="mk-lede">
                430+ live roles · 195 professions · 400 companies · 6 live sources.
                We ingest every board, screen for scams, rank what fits you, and prepare the application.
                You review. You submit. You stay in control.
              </p>
              <div className="mk-hero__cta">
                <Link href="/download" className="mk-btn mk-btn--primary mk-btn--lg">
                  <Download className="mk-btn__icon" aria-hidden="true" />
                  <span>Start free — Android APK</span>
                </Link>
                <Link href="/features" className="mk-btn mk-btn--ghost mk-btn--lg">
                  <ArrowRight className="mk-btn__icon" aria-hidden="true" />
                  <span>See how it works</span>
                </Link>
              </div>
              <div className="mk-hero__trust">
                <span className="mk-hero__trust-badge">
                  <ShieldCheck aria-hidden="true" /> Zero auto-submissions
                </span>
                <span className="mk-hero__trust-badge">
                  <Check aria-hidden="true" /> Free during founding access
                </span>
                <span className="mk-hero__trust-badge">
                  <Smartphone aria-hidden="true" /> Android app available
                </span>
              </div>
            </div>
            <div className="mk-hero__frame" aria-hidden="true">
              <VideoHero
                poster="/media/radar-poster.jpg"
                videoSrc="/media/radar-loop.mp4"
                className="mk-hero__video-hero"
              />
              <div className="mk-hero__floating" style={{ maxWidth: "360px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <div className="mk-mock-card__avatar" style={{ background: "var(--mk-danger-soft)", color: "var(--mk-danger)" }}><ShieldCheck /></div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>Risk blocked</div>
                    <div className="mk-text-muted" style={{ fontSize: "0.7rem" }}>Fake recruiter · 94/100 risk</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div className="mk-mock-card__avatar" style={{ background: "var(--mk-success-soft)", color: "var(--mk-success)" }}><Check /></div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>Verified safe</div>
                    <div className="mk-text-muted" style={{ fontSize: "0.7rem" }}>Vercel · 12/100 risk</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </VideoHero>
      </section>

      <section className="mk-section" aria-labelledby="stats-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Live platform metrics</span>
            <h2 id="stats-heading" className="mk-section-heading">Real numbers, updated every minute</h2>
            <p className="mk-section-lede">Fetched directly from the production API. No marketing fluff.</p>
          </header>
          <Stats items={[]} fallback={[]} className="mk-stats" />
        </div>
      </section>

      <section className="mk-section" style={{ background: "var(--mk-surface)", borderTop: "1px solid var(--mk-border)", borderBottom: "1px solid var(--mk-border)" }} aria-labelledby="sources-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Sources we ingest</span>
            <h2 id="sources-heading" className="mk-section-heading">Every board, one feed</h2>
          </header>
          <div className="mk-marquee" role="list" aria-label="Job sources">
            <div className="mk-marquee__track">
              {SOURCES.map((s) => (
                <span key={s.name} className="mk-marquee__item" role="listitem">{s.name} <span style={{ color: "var(--mk-accent)" }}>{s.roles} roles</span></span>
              ))}
              {SOURCES.map((s) => (
                <span key={s.name + "-2"} className="mk-marquee__item" role="listitem">{s.name} <span style={{ color: "var(--mk-accent)" }}>{s.roles} roles</span></span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="features-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">What you get</span>
            <h2 id="features-heading" className="mk-section-heading">Built for people who actually search for work</h2>
            <p className="mk-section-lede">Every feature exists because job hunting is broken. We fixed the parts we could.</p>
          </header>
          <div className="mk-grid mk-grid--3">
            {FEATURES_LANDING.map((f, i) => (
              <Reveal key={f.title} delay={i * 80} className="mk-card">
                <div className="mk-card__icon"><f.icon aria-hidden="true" /></div>
                <h3 className="mk-card__title">{f.title}</h3>
                <p className="mk-card__text">{f.body}</p>
                <Link href={f.href} className="mk-btn mk-btn--ghost mk-btn--sm" style={{ marginTop: "16px", width: "fit-content" }}>
                  <ArrowRight aria-hidden="true" /> Details
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="how-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">How it works</span>
            <h2 id="how-heading" className="mk-section-heading">From radar to application in five steps</h2>
          </header>
          <div className="mk-steps">
            {STEPS.map((s, i) => (
              <Reveal key={s.num} delay={i * 100} className="mk-step">
                <div className="mk-step__num">{s.num}</div>
                <h3 className="mk-step__title">{s.title}</h3>
                <p className="mk-step__text">{s.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="product-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Product tour</span>
            <h2 id="product-heading" className="mk-section-heading">See the control room</h2>
            <p className="mk-section-lede">Five perspectives. One platform. Swipe or use arrows.</p>
          </header>
          <Slider autoPlay autoPlayInterval={6000} showArrows showDots className="mk-slider--product">
            {SLIDER_PANELS.map((panel) => (
              <div key={panel.title} className="mk-slider__panel">
                <div className="mk-bento mk-bento--feature">
                  <div className="mk-bento__feature">
                    <div className="mk-card" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                      <h3 className="mk-card__title" style={{ marginBottom: "8px" }}>{panel.title}</h3>
                      <p className="mk-card__text" style={{ flex: 1 }}>{panel.desc}</p>
                    </div>
                  </div>
                  <div>{panel.mock}</div>
                </div>
              </div>
            ))}
          </Slider>
        </div>
      </section>

      <section className="mk-section" style={{ background: "var(--mk-surface)", borderTop: "1px solid var(--mk-border)", borderBottom: "1px solid var(--mk-border)" }} aria-labelledby="roles-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Five control rooms</span>
            <h2 id="roles-heading" className="mk-section-heading">No two dashboards alike</h2>
            <p className="mk-section-lede">Each role gets its own theme, layout and toolset — because a moderator doesn't need a job seeker's pipeline.</p>
          </header>
          <Slider autoPlay autoPlayInterval={7000} showArrows showDots className="mk-slider--roles">
            {ROLES.map((role) => (
              <div key={role.name} className="mk-role-card" style={{ "--role-accent": "var(--mk-accent)" } as React.CSSProperties}>
                <div className="mk-role-card__theme">
                  <span className="mk-role-card__swatch" style={{ background: "var(--mk-accent)" }} />
                  <span className="mk-role-card__swatch" style={{ background: "var(--mk-accent-2)" }} />
                  <span className="mk-role-card__swatch" style={{ background: "var(--mk-success)" }} />
                  <span className="mk-role-card__swatch" style={{ background: "var(--mk-info)" }} />
                </div>
                <div className="mk-role-card__icon"><role.icon aria-hidden="true" /></div>
                <h3 className="mk-role-card__name">{role.name}</h3>
                <p className="mk-role-card__desc">{role.desc}</p>
                <div className="mk-role-card__features">
                  {role.features.map((f) => (
                    <div key={f} className="mk-role-card__feature">
                      <Check aria-hidden="true" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Slider>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="mobile-heading">
        <div className="mk-container" style={{ backgroundImage: "url('/media/bg-download.jpg')", backgroundSize: "cover", backgroundPosition: "center", borderRadius: "var(--mk-radius-xl)", border: "1px solid var(--mk-border)", padding: "80px 24px" }}>
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Mobile</span>
            <h2 id="mobile-heading" className="mk-section-heading">Your radar in your pocket</h2>
            <p className="mk-section-lede">Native Flutter app. SQLite offline. Background sync. Push alerts. APK ready, Play Store submission in progress.</p>
          </header>
          <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "32px", alignItems: "flex-start" }}>
            <div className="mk-frame mk-frame--phone" style={{ backgroundImage: "linear-gradient(180deg, #0a0e1a, #070b14)" }}>
              <div className="mk-frame__bar">
                <div className="mk-frame__dots"><span className="mk-frame__dot" /><span className="mk-frame__dot" /><span className="mk-frame__dot" /></div>
                <span className="mk-frame__title">Job Radar</span>
                <div className="mk-frame__dots" />
              </div>
              <div className="mk-frame__content">
                <div className="mk-mock-list" style={{ gap: "10px" }}>
                  <div className="mk-mock-card"><div className="mk-mock-card__avatar" style={{ background: "var(--mk-accent-soft)", color: "var(--mk-accent)" }}><Sparkles /></div><div className="mk-mock-card__info"><div className="mk-mock-card__title">3 new matches</div><div className="mk-mock-card__meta"><span>Updated 2m ago</span></div></div></div>
                  <div className="mk-mock-card"><div className="mk-mock-card__avatar" style={{ background: "var(--mk-success-soft)", color: "var(--mk-success)" }}><FileText /></div><div className="mk-mock-card__info"><div className="mk-mock-card__title">CV exported</div><div className="mk-mock-card__meta"><span>PDF ready</span></div></div></div>
                  <div className="mk-mock-card"><div className="mk-mock-card__avatar" style={{ background: "var(--mk-info-soft)", color: "var(--mk-info)" }}><Globe /></div><div className="mk-mock-card__info"><div className="mk-mock-card__title">Background sync</div><div className="mk-mock-card__meta"><span>Last: 30s ago</span></div></div></div>
                </div>
              </div>
            </div>
            <div style={{ maxWidth: "420px" }}>
              <div className="mk-download__badges">
                <a href="/download" className="mk-badge">
                  <Download aria-hidden="true" /> Download APK (206 MB)
                </a>
                <a href="https://play.google.com/store/apps/details?id=com.angisoft.jobradar" target="_blank" rel="noopener noreferrer" className="mk-badge">
                  <ExternalLink aria-hidden="true" /> Coming to Google Play
                </a>
              </div>
              <div className="mk-download__features">
                {[
                  { icon: HardDrive, title: "SQLite offline", text: "Full read access to your matches, documents and pipeline without a connection." },
                  { icon: Zap, title: "Background sync", text: "New matches, reminders and alerts arrive even when the app is closed." },
                  { icon: ShieldCheck, title: "Push alerts", text: "Instant notification when a high-match role appears or a follow-up is due." },
                ].map((f, i) => (
                  <Reveal key={f.title} delay={i * 80}>
                    <div className="mk-download__feature">
                      <div className="mk-download__feature-icon"><f.icon aria-hidden="true" /></div>
                      <div className="mk-download__feature-title">{f.title}</div>
                      <div className="mk-download__feature-text">{f.text}</div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="stories-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Early access stories</span>
            <h2 id="stories-heading" className="mk-section-heading">What early users are telling us</h2>
            <p className="mk-lede">Composite profiles from our founding cohort design research. Names are illustrative.</p>
          </header>
          <div className="mk-grid mk-grid--3">
            {[
              { name: "Aisha M.", role: "Frontend Engineer → Staff", quote: "The match score saved me hours. I applied to 4 roles, got 3 interviews, and the ATS score meant my CV actually passed the filter.", tags: ["React", "Remote", "94% match"], avatar: "AM" },
              { name: "Carlos R.", role: "Data Scientist", quote: "Scam detection is real. Two listings I almost applied to were flagged — one was a crypto scam, the other a fake agency. That feature alone is worth it.", tags: ["Python", "EU", "Blocked 2"], avatar: "CR" },
              { name: "Priya K.", role: "Product Designer", quote: "The document editor is the best I've used. Three-panel layout, live ATS score, line-level diff. Exported PDF and got a callback same week.", tags: ["Figma", "NYC", "ATS 94"], avatar: "PK" },
            ].map((s, i) => (
              <Reveal key={s.name} delay={i * 80} className="mk-story">
                <div className="mk-story__avatar">{s.avatar}</div>
                <blockquote className="mk-story__quote">"{s.quote}"</blockquote>
                <div className="mk-story__author">
                  <span className="mk-story__name">{s.name}</span>
                  <span className="mk-story__role">{s.role}</span>
                </div>
                <div className="mk-story__tags">{s.tags.map((t) => <span key={t} className="mk-story__tag">{t}</span>)}</div>
              </Reveal>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: "32px" }}>
            <Link href="/stories" className="mk-btn mk-btn--ghost">
              <ArrowRight aria-hidden="true" /> Read all stories
            </Link>
          </div>
        </div>
      </section>

      <section className="mk-section mk-cta" aria-labelledby="cta-heading">
        <div className="mk-container">
          <h2 id="cta-heading" className="mk-cta__title">Ready to stop scrolling and start matching?</h2>
          <p className="mk-cta__text">Create your profile once. Let the radar work. Free to start, private by default.</p>
          <div className="mk-cta__actions">
            <Link href="/download" className="mk-btn mk-btn--primary mk-btn--lg">
              <Download aria-hidden="true" /> Get the Android APK
            </Link>
            <Link href="/contact" className="mk-btn mk-btn--ghost mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Talk to us first
            </Link>
          </div>
        </div></section>
    </MarketingLayout>
  );
}