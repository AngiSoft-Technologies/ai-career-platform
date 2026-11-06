/**
 * The identity of an employer.
 *
 * The employer's name arrives from a dozen places and no two of them
 * agree: the board's URL token ("weloglobal"), the board page's own title
 * ("Welo Global"), the posting's JSON-LD ("Welo Global"), the page's
 * `og:site_name` ("Indie Campers | LinkedIn"), the page's `<title>`,
 * the careers page's prose, and a model's guess ("Welocalize").
 *
 * Left alone, the consequences are visible in the product:
 *
 *   - **one employer under several rows.** "Weloglobal", "Welo Global"
 *     and "Welocalize" were three company rows for one board, so the
 *     catalogue split that employer's roles three ways and the
 *     recommendations saw three different employers.
 *
 *   - **a job title under the name "employer".** "Legal Counsel - 12
 *     month FTC at Rightmove Greenhouse" was the company on five rows.
 *
 *   - **the board's vendor as the employer.** "Ashby", "LLEVERAGE",
 *     "How We Work & What We Value - Ashby".
 *
 *   - **a false change on every re-read.** The stored name and the newly
 *     read name differed by a space, and the pipeline took that for an
 *     edit — twenty-nine "the employer changed" events for one board
 *     that had not changed at all.
 *
 * This module is the single answer. It turns a raw name into
 *
 *   - a **canonical key** — so "AnywhereNow" and "Anywhere Now" are one
 *     employer, and the same comparison is used for the fingerprint, the
 *     slug and the change judge; and
 *   - a **cleaned display name** — so the catalogue shows "Indie
 *     Campers" and not "Indie Campers | LinkedIn".
 *
 * It has no dependency on the extractor, the AI client or the database:
 * the search chain needs it, and the search chain must not drag the
 * whole extraction pipeline in behind it.
 */

import { ROLE_WORDS } from "./job-title.js";
/**
 * The boards' own names.
 *
 * They appear in two ways: as a suffix the page appended to the
 * employer's name ("Indie Campers | LinkedIn", "SingleStore-LinkedIn"),
 * and as the whole name when the page had no employer to offer and the
 * board's name was all there was ("Ashby").
 *
 * "Oracle" is deliberately absent: it is a board *and* an employer, and
 * the employer's jobs are worth keeping.
 */
const BOARD_NAMES = [
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "smartrecruiters",
  "recruitee",
  "workday",
  "taleo",
  "icims",
  "breezy",
  "jobvite",
  "linkedin",
  "indeed",
  "glassdoor",
  "monster",
  "ziprecruiter",
  "totaljobs",
  "reed",
  "jobscanner",
  "hirewithgoogle",
] as const;

const BOARD_SUFFIX = new RegExp(
  `\\s*[|\\-–—@/]\\s*(?:${BOARD_NAMES.join("|")})\\b.*$`,
  "i",
);

const BOARD_ALONE = new Set<string>(BOARD_NAMES);

/**
 * The role words that a firm puts at the end of its own name.
 *
 * "True North Partners", "AcceleRail Advisors", "Molt Legal Partners" —
 * a firm names itself in the plural. A title does not: "IT Consultant"
 * is a role, "Consultants" is a firm.
 */
const FIRM_WORDS = new Set([
  "partner",
  "advisor",
  "adviser",
  "broker",
  "consultant",
  "associate",
]);

/**
 * The words that belong to a question, not to a name.
 *
 * "How We Work & What We Value" is a page heading. "Acme" is an
 * employer. The difference is the question words.
 *
 * The pronouns are deliberately not here: "We Are Social", "My Health
 * & Beauty" and "Your Software Supplier" are all real employers, and
 * they are more common on a job board than a heading is.
 */
const SENTENCE_WORDS = new Set([
  "what",
  "why",
  "how",
  "when",
  "where",
  "who",
  "which",
]);

/**
 * Legal forms.
 *
 * They say which *jurisdiction* the employer is in and nothing about
 * which employer it is, so "Acme Ltd" and "Acme Limited" are one
 * employer. "Group" and "Holdings" are *not* here: they are part of
 * the brand often enough that dropping them would merge two different
 * employers.
 */
const LEGAL_FORMS = [
  "co",
  "company",
  "ltd",
  "limited",
  "inc",
  "incorporated",
  "llc",
  "llp",
  "plc",
  "gmbh",
  "ag",
  "bv",
  "nv",
  "sa",
  "sas",
  "sarl",
  "srl",
  "spa",
  "ab",
  "as",
  "oy",
  "kg",
  "pty",
  "pvt",
  "corp",
  "corporation",
  "limited-liability-company",
] as const;

/**
 * The cleanest form of a raw employer name.
 *
 * Returns null when the name cannot be an employer: a job title, a page
 * heading, a board's name on its own, or nothing at all.
 */
export function normaliseCompanyName(
  value: string | null | undefined,
): string | null {
  if (!value) return null;

  let name = value
    .replace(/\s*\(?\s*opens in new tab\s*\)?\s*/gi, " ")
    .replace(/["'`]+/g, "")
    .replace(/[{}<>\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!name) return null;

  // A path fragment or a sentence is not a company. A dot is not: half
  // the employers on a technology board are named after their domain
  // ("Happyrobot.ai", "Checkout.com", "Monday.com"), and refusing
  // those would refuse the employer along with the posting.
  if (/[-_]{2,}|\/|\\/.test(name)) return null;
  if (/^[.#]/.test(name)) return null;
  // All-lowercase kebab-case is the shape of a CSS class, not of a
  // company: "cookies-similar-technology".
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(name)) return null;
  if (name.length < 2 || name.length > 120) return null;

  // "Cookies", "Privacy policy", "Skip to main content" and friends.
  if (
    /^(cookies?|privacy( policy| notice)?|terms( of (use|service))?|skip to .+|home|menu|search|login|sign in|advertisement|sponsored)$/i.test(
      name,
    )
  ) {
    return null;
  }

  // The board's name, appended to the employer's own.
  name = name.replace(BOARD_SUFFIX, "").trim();
  if (!name) return null;

  // "Acme Careers", "Acme Jobs" — the page's word, not the employer's.
  name = name
    .replace(/\s+(?:jobs?|careers?|vacancies|openings|positions|roles)\.?$/i, "")
    .trim();
  if (!name) return null;

  // Oracle's own label for a tenant whose site has no name of its own:
  // "Safaricom Candidate Experience site" is Safaricom.
  name = name
    .replace(/\s+candidate experience(?:\s+site)?\.?$/i, "")
    .trim();
  if (!name) return null;

  // The board's own label for itself: "SCI Career Site" is SCI, and
  // "Welo Global Careers Site" is Welo Global. The word "site" belongs
  // to the board, not to the employer.
  name = name.replace(/\s+careers?\s+site\.?$/i, "").trim();
  if (!name) return null;

  // The legal form, once.
  const withoutLegal = name.replace(
    new RegExp(`\\s+(?:${LEGAL_FORMS.join("|")})\\.?$`, "i"),
    "",
  );
  if (withoutLegal.length >= 2) name = withoutLegal;

  if (!isPlausibleEmployer(name)) return null;
  return name;
}

/**
 * True when a name could be an employer.
 *
 * The rule is deliberately narrow, because a real employer is often a
 * single word that happens to contain a role word ("United Artists",
 * "General Mills", "Artisan"). What rules out a name is a *shape*:
 *
 *   - a job title's own shape — "<Role> at <Company>" is a title with
 *     the employer appended to it
 *   - a page heading's shape — more than five words is a sentence
 *   - the board's name on its own
 *   - a role at the *end* of a short name — "Software Engineer",
 *     "Project Manager", "Channel Sales Support Agent". An employer
 *     that happens to contain a role word puts it somewhere else:
 *     "True North Partners", "Customs Support Group" — and is kept.
 */
export function isPlausibleEmployer(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;

  // "<Role> at <Company>" — the employer's name is on the right of the
  // "at", not the whole thing.
  if (/\sat\b/i.test(trimmed)) return false;

  const words = trimmed
    .toLowerCase()
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);

  if (words.length === 0 || words.length > 6) return false;

  // A sentence is not a name.
  if (words.some((word) => SENTENCE_WORDS.has(word))) return false;

  // The board's name and nothing else.
  if (words.length === 1 && BOARD_ALONE.has(words[0] ?? "")) return false;

  // A title names the role at its end.
  if (words.length <= 4) {
    const last = words[words.length - 1] ?? "";
    const plural = last.endsWith("s") && last.length > 3;
    const singular = plural ? last.slice(0, -1) : last;
    // A firm names itself with one of these — "True North Partners",
    // "AcceleRail Advisors" — and a title does not: "IT Consultant" is
    // a role, "Consultants" is a firm.
    if (!FIRM_WORDS.has(singular)) {
      if (ROLE_WORDS.has(last) || ROLE_WORDS.has(singular)) return false;
    }
  }

  return true;
}

/**
 * The canonical key of an employer — its identity.
 *
 * Two names that differ only in spacing, punctuation, case or legal
 * form are one employer, and this is what says so:
 *
 *   "AnywhereNow"  → "anywherenow"
 *   "Anywhere Now" → "anywherenow"
 *   "Acme, Ltd."    → "acme"
 *   "ACME LIMITED" → "acme"
 *
 * The spaces are dropped rather than folded into a separator, so a name
 * written as one word and the same name written as two are one
 * employer. That is the difference between "one employer, one row" and
 * "one employer, three rows".
 *
 * The key is stored on the employer's row, and the database refuses to
 * let two rows share it. So the rule is not a convention the
 * application follows politely — it is a constraint.
 *
 * Returns an empty string when the name is not an employer at all.
 */
export function canonicalCompanyKey(
  value: string | null | undefined,
): string {
  const name = normaliseCompanyName(value);
  if (!name) return "";

  const key = name
    .toLowerCase()
    .normalize("NFKD")
    // Strip the diacritics: "Café" and "Cafe" are one employer.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "");

  return key;
}

/**
 * The key of a name that is not an employer.
 *
 * "Writer", "Legal Counsel - 12 month FTC at Rightmove Greenhouse" and
 * "Ashby" are not employers — they are a job title, a posting's
 * heading and a board's own name. The canonical key refuses them, and
 * that is right: an employer called "Software Engineer" is worse than
 * an employer with no name at all.
 *
 * But they still need an identity of their own, or every such posting
 * in the catalogue would share one — and two different employers' roles
 * would look like the same job twice over.
 *
 * So the raw name is keyed as it stands. This is the fallback, never
 * the rule.
 */
export function rawCompanyKey(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 80);
}

/**
 * The catalogue's slug for an employer.
 *
 * The slug is the readable form of the name — "kcb-bank",
 * "kenya-airways" — because it is what a person reads in the address
 * bar, and because two thousand eight hundred employers already have
 * one. It is capped at eighty characters, which is the column's limit.
 *
 * The slug is not the employer's *identity*: two employers can be
 * written the same way and the identity is what says so. That is the
 * canonical key's job.
 */
export function companySlug(value: string | null | undefined): string {
  if (!value) return "";
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 80);
}

/**
 * True when two employer names are the same employer.
 *
 * This is the comparison the change judge uses. A re-read that spells
 * the employer's name differently has not found an edit; it has found
 * the same employer written another way.
 */
export function sameCompany(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftKey = canonicalCompanyKey(left);
  const rightKey = canonicalCompanyKey(right);
  if (!leftKey || !rightKey) return leftKey === rightKey;
  return leftKey === rightKey;
}
