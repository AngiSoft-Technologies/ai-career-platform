/**
 * Product illustrations used by the public marketing pages. Inline SVG keeps
 * them crisp at any size, on-brand, and free of stock imagery.
 */
export function DiscoveryIllustration() {
  return (
    <svg viewBox="0 0 320 220" role="img" aria-label="A list of job roles with a search field and filters">
      <rect x="24" y="20" width="272" height="26" rx="13" fill="var(--mk-surface-2)" />
      <circle cx="44" cy="33" r="5" fill="none" stroke="var(--mk-text-muted)" strokeWidth="2" />
      <path d="M60 33h84" stroke="var(--mk-text-muted)" strokeWidth="3" strokeLinecap="round" />
      <g>
        {[62, 108, 154].map((y, i) => (
          <g key={y}>
            <rect x="24" y={y} width="272" height="34" rx="10" fill="var(--mk-surface)" stroke="var(--mk-border)" />
            <rect x="36" y={y + 10} width="26" height="14" rx="4" fill={i === 0 ? "var(--mk-accent-soft)" : "var(--mk-surface-2)"} />
            <path d={`M72 ${y + 20}h${i === 0 ? 130 : 96}`} stroke="var(--mk-text-soft)" strokeWidth="4" strokeLinecap="round" />
            <path d={`M72 ${y + 28}h52`} stroke="var(--mk-text-muted)" strokeWidth="3" strokeLinecap="round" />
            <circle cx={288} cy={y + 17} r="5" fill={i === 0 ? "var(--mk-accent)" : "var(--mk-surface-2)"} />
          </g>
        ))}
      </g>
      <g>
        {["All", "Remote", "Kenya", "Internship"].map((label, i) => (
          <g key={label}>
            <rect x={24 + i * 68} y={196} width={i === 0 ? 56 : 62} height="20" rx="10"
              fill={i === 0 ? "var(--mk-accent)" : "var(--mk-surface-2)"} />
            <text x={24 + i * 68 + (i === 0 ? 28 : 31)} y={210} textAnchor="middle" fontSize="9"
              fill={i === 0 ? "var(--mk-accent-contrast)" : "var(--mk-text-muted)"}>{label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export function MatchIllustration() {
  return (
    <svg viewBox="0 0 320 220" role="img" aria-label="A match score dial with matching skills highlighted">
      <circle cx="128" cy="110" r="58" fill="none" stroke="var(--mk-surface-2)" strokeWidth="14" />
      <circle cx="128" cy="110" r="58" fill="none" stroke="var(--mk-accent)" strokeWidth="14"
        strokeLinecap="round" strokeDasharray="273" strokeDashoffset="60" transform="rotate(-90 128 110)" />
      <text x="128" y="105" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--mk-text)">82</text>
      <text x="128" y="126" textAnchor="middle" fontSize="10" fill="var(--mk-text-muted)">match</text>
      <g>
        {["TypeScript", "Product", "Nairobi", "Remote"].map((label, i) => (
          <g key={label}>
            <rect x="206" y={28 + i * 30} width="94" height="22" rx="11"
              fill={i < 3 ? "var(--mk-accent-soft)" : "var(--mk-surface-2)"} />
            <text x="253" y={43 + i * 30} textAnchor="middle" fontSize="10"
              fill={i < 3 ? "var(--mk-accent)" : "var(--mk-text-muted)"}>{label}</text>
          </g>
        ))}
      </g>
      <path d="M96 194h160" stroke="var(--mk-border)" strokeWidth="2" />
      <g>
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={72 + i * 40} y="186" width="24" height="14" rx="3"
            fill={i < 4 ? "var(--mk-accent)" : "var(--mk-surface-2)"} />
        ))}
      </g>
    </svg>
  );
}

export function DocumentIllustration() {
  return (
    <svg viewBox="0 0 320 220" role="img" aria-label="A CV page with sections of text and an export badge">
      <rect x="86" y="16" width="148" height="188" rx="8" fill="var(--mk-surface)" stroke="var(--mk-border)" />
      <rect x="86" y="16" width="148" height="26" rx="8" fill="var(--mk-surface-2)" />
      <path d="M100 33h64" stroke="var(--mk-text-soft)" strokeWidth="5" strokeLinecap="round" />
      {[62, 92, 122].map((y) => (
        <g key={y}>
          <path d={`M100 ${y}h60`} stroke="var(--mk-accent)" strokeWidth="4" strokeLinecap="round" />
          <path d={`M100 ${y + 12}h120`} stroke="var(--mk-surface-2)" strokeWidth="4" strokeLinecap="round" />
          <path d={`M100 ${y + 22}h104`} stroke="var(--mk-surface-2)" strokeWidth="4" strokeLinecap="round" />
          <path d={`M100 ${y + 32}h70`} stroke="var(--mk-surface-2)" strokeWidth="4" strokeLinecap="round" />
        </g>
      ))}
      <path d="M166 184v20" stroke="var(--mk-border)" strokeWidth="2" />
      <g>
        <rect x="196" y="20" width="84" height="34" rx="8" fill="var(--mk-success-soft)" />
        <text x="238" y="34" textAnchor="middle" fontSize="10" fill="var(--mk-success)">Ready</text>
        <text x="238" y="46" textAnchor="middle" fontSize="8" fill="var(--mk-text-muted)">PDF · Word</text>
        <rect x="196" y="160" width="84" height="30" rx="15" fill="var(--mk-accent)" />
        <text x="238" y="179" textAnchor="middle" fontSize="10" fill="var(--mk-accent-contrast)">Export</text>
      </g>
    </svg>
  );
}

export function TrackerIllustration() {
  return (
    <svg viewBox="0 0 320 220" role="img" aria-label="A job application board with stages as columns">
      {["Applied", "Interview", "Offer"].map((label, i) => (
        <g key={label}>
          <rect x={20 + i * 98} y="28" width="88" height="150" rx="10" fill="var(--mk-surface)" stroke="var(--mk-border)" />
          <text x={20 + i * 98 + 44} y="46" textAnchor="middle" fontSize="10" fill="var(--mk-text-soft)">{label}</text>
          {[0, 1].map((j) => (
            <rect key={j} x={28 + i * 98} y={58 + j * 52} width="72" height="40" rx="7"
              fill={i === 1 && j === 0 ? "var(--mk-accent-soft)" : "var(--mk-surface-2)"} />
          ))}
          <circle cx={20 + i * 98 + 64} cy={78} r="6" fill={i === 1 ? "var(--mk-accent)" : "var(--mk-success)"} />
        </g>
      ))}
      <rect x="20" y="188" width="282" height="20" rx="10" fill="var(--mk-surface-2)" />
      <path d="M36 198h150" stroke="var(--mk-text-muted)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="290" cy="198" r="5" fill="var(--mk-accent)" />
    </svg>
  );
}

export const PRODUCT_ILLUSTRATIONS = {
  discovery: DiscoveryIllustration,
  match: MatchIllustration,
  document: DocumentIllustration,
  tracker: TrackerIllustration,
} as const;
