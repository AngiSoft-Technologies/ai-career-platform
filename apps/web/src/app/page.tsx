import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  FileCheck2,
  Globe2,
  Radar,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";

const FEATURES = [
  {
    icon: Globe2,
    title: "Every board, one search",
    body: "We ingest job boards, ATS feeds and local portals across 40+ countries, then normalise them into a single ranking you can trust.",
  },
  {
    icon: Radar,
    title: "Scam detection first",
    body: "Every posting is fingerprinted and checked against salary medians and company history before you ever see it. Blocked postings never reach your feed.",
  },
  {
    icon: Sparkles,
    title: "AI that only uses your facts",
    body: "The model rearranges what you wrote. It never invents a skill, a date or a employer. Every suggestion traces back to your profile.",
  },
  {
    icon: FileCheck2,
    title: "Documents that pass ATS",
    body: "Build a CV, cover letter and portfolio in one editor, see the ATS score live, and export PDF, DOCX, PPTX or PNG.",
  },
  {
    icon: Timer,
    title: "You apply, we assist",
    body: "We detect the employer's form, draft every answer, track your pipeline and remind you to follow up. We never submit without you.",
  },
  {
    icon: ShieldCheck,
    title: "Private by construction",
    body: "Your documents live in private storage behind signed URLs. Your data trains nothing and is never sold.",
  },
];

const FLOW = [
  { step: "01", title: "The radar", body: "Hundreds of boards, ATS feeds and local portals scanned continuously." },
  { step: "02", title: "The filter", body: "Scam fingerprints, salary checks and duplicate detection clear the noise." },
  { step: "03", title: "The match", body: "Skills, location, work mode and semantics combined into one honest score." },
  { step: "04", title: "The kit", body: "An ATS-ready CV and cover letter built from your profile, not from a template." },
  { step: "05", title: "You apply", body: "The form is prepared, you review it, you press submit. We track what happens next." },
];

export default function LandingPage() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <Link href="/" className="landing-brand">
          <Radar size={20} /> Job Radar
        </Link>
        <div className="row row-wrap" style={{ gap: "0.5rem" }}>
          <Link href="/login" className="btn btn-ghost btn-sm">
            Sign in
          </Link>
          <Link href="/login" className="btn btn-primary btn-sm">
            Create free account <ArrowRight size={14} />
          </Link>
        </div>
      </nav>

      <section className="landing-hero">
        <BadgeCheck size={26} className="landing-kicker" />
        <h1 className="landing-title">
          All the jobs in the world.
          <br />
          <span className="landing-title-accent">One honest search.</span>
        </h1>
        <p className="landing-lede">
          Job Radar pulls every board into one feed, removes the scams before you see them, ranks
          what actually fits you and prepares the application. You keep control of every submit.
        </p>
        <div className="row row-wrap" style={{ gap: "0.6rem", justifyContent: "center" }}>
          <Link href="/login" className="btn btn-primary btn-lg">
            Build your radar <ArrowRight size={16} />
          </Link>
          <Link href="/opportunities" className="btn btn-outline btn-lg">
            Browse live roles
          </Link>
        </div>
        <div className="landing-stats">
          <div>
            <strong>200+</strong>
            <span>sources monitored</span>
          </div>
          <div>
            <strong>195</strong>
            <span>professions mapped</span>
          </div>
          <div>
            <strong>40+</strong>
            <span>countries</span>
          </div>
          <div>
            <strong>0</strong>
            <span>auto-submissions</span>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-heading">Built for people who actually search for work</h2>
        <div className="landing-grid">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="landing-card">
              <feature.icon size={19} />
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-flow">
        <h2 className="landing-heading">How a role becomes an application</h2>
        <ol className="landing-steps">
          {FLOW.map((item) => (
            <li key={item.step}>
              <span className="mono landing-step-number">{item.step}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section landing-cta">
        <h2 className="landing-heading">Your next role is out there</h2>
        <p className="landing-lede" style={{ margin: "0 auto 1.4rem" }}>
          Create a profile once and let the radar work. Free to start, private by default, built for
          every profession.
        </p>
        <Link href="/login" className="btn btn-primary btn-lg">
          Start now <ArrowRight size={16} />
        </Link>
      </section>

      <footer className="landing-footer">
        <span>Job Radar by AngiSoft Technologies</span>
        <span>AI prepares. You decide. You submit.</span>
      </footer>
    </main>
  );
}
