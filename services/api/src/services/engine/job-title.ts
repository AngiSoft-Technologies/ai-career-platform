/**
 * The title rules.
 *
 * "Is this page about a role?" is a question the search engine, the
 * browse agent and the extractor all have to answer, and they have to
 * answer it the same way. So the rules live here, on their own, with no
 * dependency on the extractor or on the AI client: the search chain
 * needs them, and the search chain must not drag the whole extraction
 * pipeline in behind it.
 *
 * A search-engine browse turns up articles, manuals, marketplace
 * listings and index pages as readily as postings. The title says which
 * it is: "What is ERP?" is an article, "Senior Data Analyst" is a role,
 * and "Sales De Baño Epsom 300g Green Harmony" is a product.
 */

/**
 * Title shapes that are never a role.
 *
 * A title shaped like a question, a guide or a list is not a posting.
 */
export const NON_ROLE_TITLE =
  /^(?:what|why|when|where|who|how|which)\b.*\b(?:is|are|do|does|can|should|to|meaning|definition|guide)\b/i;

export const NON_ROLE_TITLE_OPENER =
  /^(?:introduction to|guide to|overview of|everything you need to know about|learn more about|top\s+\d+|best\s+\d+|list of|examples? of|complaint? -|comparison of|difference between|steps? to|how to|welcome to|download|home|about|about[s]?|contact|features?|faq|glossary|news|blog|login|sign in|search|privacy|terms)\b/i;

/**
 * Words that name a *page*, not a role.
 *
 * They turn up in the titles of articles, manuals, marketplace listings
 * and schedules — the things a search-engine browse turns up most.
 */
export const PAGE_TOPIC_TITLE =
  /\b(?:examples?|for sale|free download|schedules?|vacation rentals?|enciclopedia|encyclopedia|mcq|questions and answers|airbnb|tutorial|tutorials|pricing)\b/i;

/**
 * Page chrome that is never a title.
 */
export const CHROME_TITLE =
  /^(?:null|undefined|n\/?a|untitled( position)?|document|page|home|menu|search|loading|error|features?|methodology|download|contact|about|abouts|news|blog|faq|glossary|privacy|terms)$/i;

/**
 * Words that name a *listing*, not a role.
 *
 * "Data Analyst Jobs in Kenya (29 Openings)" is a page of many jobs, not
 * a job.
 *
 * The rule is deliberately narrow. A plural noun on its own is not
 * enough — "Junior Software Engineer (50k) - Jobs in Kenya .co .ke" is
 * a real posting on a board whose name contains "Jobs", and refusing it
 * would cost a job. "Vacancies" and "Openings" are the words that
 * appear on a listing and not on a posting.
 */
export const LISTING_TITLE = /\b(?:vacancies|openings)\b/i;

/**
 * The nouns a role title is built from.
 *
 * A title that names no role is not a role title: it is a product, an
 * article or a page heading. This is the strongest signal there is,
 * because it is what the title is *for* rather than what it looks like.
 */
export const ROLE_WORDS = new Set([
  "accountant", "actuary", "administrator", "advisor", "adviser", "agent",
  "ambassador", "analyst", "appraiser", "apprentice", "architect", "archivist",
  "artist", "assembler", "assessor", "assistant", "associate", "attendant",
  "auditor", "author", "babysitter", "banker", "barber", "barista", "bartender",
  "baker", "beam", "broker", "buyer", "carer", "carpenter", "cashier",
  "caterer", "ceo", "cfo", "chef", "cleaner", "clerk", "coach", "consultant",
  "contractor", "controller", "coordinator", "copywriter", "counsel",
  "counsellor", "courier", "curator", "customer", "cto", "designer",
  "developer", "director", "dispatcher", "driver", "editor", "electrician",
  "engineer", "estimator", "executive", "expert", "facilitator", "farmer",
  "fashion", "firefighter", "fitter", "florist", "founder", "freelance",
  "generalist", "gardener", "graduate", "guard", "head", "helper", "host",
  "inspector", "instructor", "intern", "internship", "keeper", "labourer",
  "laborer", "leader", "lecturer", "librarian", "lifeguard", "locksmith",
  "machinist", "manager", "marketer", "maser", "mechanic", "mentor", "moderator",
  "nanny", "notary", "nurse", "officer", "operative", "operator", "owner",
  "painter", "paralegal", "partner", "pharmacist", "photographer", "physician",
  "picker", "planner", "plumber", "porter", "president", "producer",
  "professional", "programmer", "proofreader", "psychologist", "publisher",
  "realtor", "receptionist", "recruiter", "registrar", "reporter",
  "representative", "researcher", "roofer", "runner", "salesperson",
  "scientist", "secretary", "seller", "solicitor", "specialist", "steward",
  "strategist", "stylist", "supervisor", "surveyor", "tailor", "teller",
  "teacher", "technician", "technologist", "trainee", "trainer", "translator",
  "truck", "tutor", "underwriter", "usher", "valuer", "verifier", "volunteer",
  "waiter", "waitress", "weaver", "welder", "worker", "writer",
]);

/**
 * True when the title names a role.
 *
 * The list is the one that matters: a title that names no role is not
 * a role title, it is a product, an article or a page heading. A
 * suffix heuristic was tried and dropped — "better" ends in "er", so
 * "Build software better, together" read as a role.
 *
 * A plural counts: "Engineers" names a role as plainly as "Engineer"
 * does. A singular ending in "s" is not enough on its own — "Sales" and
 * "Jobs" are not roles.
 */
export function namesARole(title: string): boolean {
  const words = title
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);

  for (const word of words) {
    if (ROLE_WORDS.has(word)) return true;
    if (word.endsWith("s") && word.length > 3) {
      const stem = word.slice(0, -1);
      if (ROLE_WORDS.has(stem)) return true;
    }
  }
  return false;
}

/**
 * Cleans a job title, and rejects the titles that are not job titles.
 *
 * Returns null when the title is an article, an index page or a piece
 * of page chrome. A title that names a company ("Software Engineer |
 * Acme") keeps its role part only.
 */
export function cleanJobTitle(value: string | null | undefined): string | null {
  if (!value) return null;

  let cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  // An encyclopedia entry is not a role, whatever it is called.
  if (/\bwikipedia\b/i.test(cleaned)) return null;

  // "Software Engineer | Acme" — the role is the part before the pipe.
  const pipe = cleaned.indexOf(" | ");
  if (pipe > 0) cleaned = cleaned.slice(0, pipe).trim();
  if (!cleaned) return null;

  if (cleaned.length < 2 || cleaned.length > 140) return null;
  if (/^https?:\/\//i.test(cleaned)) return null;

  const words = cleaned.split(/\s+/);
  // A sentence is not a role.
  if (words.length > 14) return null;

  // A question is not a role.
  if (cleaned.endsWith("?")) return null;

  // An index page: "Jobs in Kenya", "Tshwane Careers".
  if (/^(?:jobs?|careers?|vacancies|openings?)\b/i.test(cleaned)) return null;
  if (/\b(?:careers|jobs)\s*$/i.test(cleaned)) return null;

  // A numbered article: "The 7 Fundamental Elements of ...".
  if (/^the \d+\b/i.test(cleaned)) return null;

  if (NON_ROLE_TITLE.test(cleaned)) return null;
  if (NON_ROLE_TITLE_OPENER.test(cleaned)) return null;
  if (PAGE_TOPIC_TITLE.test(cleaned)) return null;
  if (CHROME_TITLE.test(cleaned)) return null;
  if (LISTING_TITLE.test(cleaned)) return null;

  // The title has to name a role. "Sales De Baño Epsom 300g Green
  // Harmony" is a product; "Senior Data Analyst" is a job.
  if (!namesARole(cleaned)) return null;

  return cleaned;
}
