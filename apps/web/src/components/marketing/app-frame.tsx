"use client";

import type { ReactNode } from "react";
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileText,
  MapPin,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

/**
 * Product shots, drawn from the real interface.
 *
 * A photograph of a screen goes stale the moment the product ships, and
 * capturing the signed-in app needs a session nobody should hand to a
 * build step. Instead these frames render the product's actual layouts —
 * the feed with its match score, the trust panel, the document draft —
 * so the marketing site shows what the app really does.
 */
export function AppFrame({
  url,
  label,
  children,
  className,
}: {
  url: string;
  /** What the frame shows, for anyone who cannot see it. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mk-app-frame ${className ?? ""}`.trim()} role="img" aria-label={label}>
      <div className="mk-app-frame__chrome">
        <span className="mk-app-frame__dots" aria-hidden="true">
          <span className="mk-app-frame__dot" />
          <span className="mk-app-frame__dot" />
          <span className="mk-app-frame__dot" />
        </span>
        <span className="mk-app-frame__url">{url}</span>
      </div>
      <div className="mk-app-frame__body">{children}</div>
    </div>
  );
}

/** The opportunity feed: search row, then roles with their match score. */
export function OpportunityFeedMock() {
  return (
    <div className="mk-mock">
      <div className="mk-mock__bar">
        <span className="mk-mock__pill">
          <Search aria-hidden="true" /> Data analyst
        </span>
        <span className="mk-mock__pill">
          <MapPin aria-hidden="true" /> Nairobi or remote
        </span>
        <span className="mk-mock__pill mk-mock__pill--verified">
          <BadgeCheck aria-hidden="true" /> Roles I can hold
        </span>
        <span className="mk-mock__pill mk-mock__pill--signal">
          <Sparkles aria-hidden="true" /> Ranked
        </span>
      </div>

      <div className="mk-mock__card">
        <div className="mk-mock__card-head">
          <div>
            <h4 className="mk-mock__title">Junior Data Analyst</h4>
            <p className="mk-mock__org">KenGen · Company career page · posted 2 days ago</p>
          </div>
          <div className="mk-mock__score">
            <span className="mk-mock__score-value mk-numeral">91</span>
            <span className="mk-mock__score-label">Match</span>
          </div>
        </div>
        <div className="mk-mock__meta">
          <span>
            <Wallet aria-hidden="true" /> KSh 120–180k
          </span>
          <span>
            <MapPin aria-hidden="true" /> Nairobi · hybrid
          </span>
          <span>
            <CalendarClock aria-hidden="true" /> Closes in 21 days
          </span>
        </div>
        <div className="mk-mock__bar">
          <span className="mk-mock__pill mk-mock__pill--verified">
            <CheckCircle2 aria-hidden="true" /> You can hold this
          </span>
          <span className="mk-mock__pill">
            <Building2 aria-hidden="true" /> 4 of your skills match
          </span>
        </div>
      </div>

      <div className="mk-mock__card">
        <div className="mk-mock__card-head">
          <div>
            <h4 className="mk-mock__title">Graduate Trainee, Analytics</h4>
            <p className="mk-mock__org">Safaricom · Workday board · posted 5 days ago</p>
          </div>
          <div className="mk-mock__score">
            <span className="mk-mock__score-value mk-numeral">84</span>
            <span className="mk-mock__score-label">Match
            </span>
          </div>
        </div>
        <div className="mk-mock__meta">
          <span>
            <Wallet aria-hidden="true" /> KSh 85k
          </span>
          <span>
            <MapPin aria-hidden="true" /> Nairobi · onsite
          </span>
          <span>
            <CalendarClock aria-hidden="true" /> Closes in 9 days
          </span>
        </div>
        <div className="mk-mock__bar">
          <span className="mk-mock__pill mk-mock__pill--verified">
            <CheckCircle2 aria-hidden="true" /> You can hold this
          </span>
          <span className="mk-mock__pill">Internship · 12 months</span>
        </div>
      </div>
    </div>
  );
}

/** The trust engine's verdict on one posting — the Scam Shield. */
export function TrustEngineMock() {
  return (
    <div className="mk-mock">
      <div className="mk-mock__card">
        <div className="mk-mock__card-head">
          <div>
            <h4 className="mk-mock__title">Operations Manager — Logistics</h4>
            <p className="mk-mock__org">A career page nobody has heard of · first seen today</p>
          </div>
          <div className="mk-mock__score" style={{ background: "var(--mk-danger-soft)", borderColor: "rgba(251,113,133,0.35)" }}>
            <span className="mk-mock__score-value mk-numeral" style={{ color: "var(--mk-danger)" }}>
              72
            </span>
            <span className="mk-mock__score-label">Risk</span>
          </div>
        </div>
        <div className="mk-mock__meter" aria-hidden="true">
          <span style={{ width: "72%", background: "linear-gradient(90deg, var(--mk-signal), var(--mk-danger))" }} />
        </div>
      </div>

      <div className="mk-mock__row">
        <ShieldAlert aria-hidden="true" size={14} color="var(--mk-danger)" />
        <span className="mk-mock__row-label">Salary is 14× what this title pays elsewhere</span>
        <span className="mk-mock__row-value" style={{ color: "var(--mk-danger)" }}>
          Outlier
        </span>
      </div>
      <div className="mk-mock__row">
        <ShieldAlert aria-hidden="true" size={14} color="var(--mk-danger)" />
        <span className="mk-mock__row-label">Domain registered three weeks ago</span>
        <span className="mk-mock__row-value" style={{ color: "var(--mk-danger)" }}>
          New
        </span>
      </div>
      <div className="mk-mock__row">
        <FileText aria-hidden="true" size={14} color="var(--mk-text-muted)" />
        <span className="mk-mock__row-label">Posting text matches a known template</span>
        <span className="mk-mock__row-value">Template</span>
      </div>
      <div className="mk-mock__row" style={{ borderColor: "rgba(62,207,142,0.35)", background: "var(--mk-verified-soft)" }}>
        <ShieldCheck aria-hidden="true" size={14} color="var(--mk-verified)" />
        <span className="mk-mock__row-label">Decision — held back from the feed</span>
        <span className="mk-mock__row-value mk-mock__row-value--verified">Held</span>
      </div>
    </div>
  );
}

/** A document drafted for one specific role. */
export function DocumentDraftMock() {
  return (
    <div className="mk-mock">
      <div className="mk-mock__bar">
        <span className="mk-mock__pill mk-mock__pill--insight">
          <FileText aria-hidden="true" /> CV — Junior Data Analyst, KenGen
        </span>
        <span className="mk-mock__pill">PDF · ready</span>
      </div>
      <div className="mk-mock__card">
        <div className="mk-mock__bar" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.86rem", fontWeight: 750, color: "var(--mk-text)" }}>Amina Otieno</span>
          <span className="mk-mock__pill" style={{ fontSize: "0.62rem" }}>
            Drafted from your profile
          </span>
        </div>
        <div className="mk-mock__lines" aria-hidden="true">
          <span className="mk-mock__line" />
          <span className="mk-mock__line" />
          <span className="mk-mock__line" />
          <span className="mk-mock__line" />
        </div>
        <div className="mk-mock__bar">
          <span className="mk-mock__pill mk-mock__pill--verified">
            <CheckCircle2 aria-hidden="true" /> SQL — named in the posting
          </span>
          <span className="mk-mock__pill mk-mock__pill--verified">
            <CheckCircle2 aria-hidden="true" /> Power BI — named in the posting
          </span>
        </div>
      </div>
    </div>
  );
}

/** Applications, each at its own stage. */
export function TrackerMock() {
  const stages = ["Saved", "Applied", "Interview", "Offer"];
  const active = [true, true, true, false];
  return (
    <div className="mk-mock">
      <div className="mk-mock__bar" style={{ gap: "6px" }}>
        {stages.map((stage, i) => (
          <span
            key={stage}
            className={`mk-mock__pill${active[i] ? " mk-mock__pill--verified" : ""}`}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {active[i] ? <CheckCircle2 aria-hidden="true" /> : null}
            {stage}
          </span>
        ))}
      </div>
      <div className="mk-mock__row">
        <span className="mk-mock__row-label">Junior Data Analyst — KenGen</span>
        <span className="mk-mock__row-value mk-mock__row-value--signal">Interview Thu</span>
      </div>
      <div className="mk-mock__row">
        <span className="mk-mock__row-label">Graduate Trainee — Safaricom</span>
        <span className="mk-mock__row-value">Applied 3 days ago</span>
      </div>
      <div className="mk-mock__row">
        <span className="mk-mock__row-label">Credit Analyst — Equity</span>
        <span className="mk-mock__row-value">Follow up today</span>
      </div>
    </div>
  );
}
