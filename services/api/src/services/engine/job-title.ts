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
export const LISTING_TITLE = /\b(?:vacancies|openings|open roles|job openings)\b/i;

/**
 * True when the title says the page is a *listing* — a page of many
 * postings rather than one posting.
 *
 * This is the question the search agent has to answer before it queues
 * a URL, because the two pages are read in different ways: a posting is
 * extracted, a listing is mined for the postings inside it.
 *
 * Almost every job query is answered with listings. "Legal jobs Kenya"
 * comes back as "Legal Jobs in Kenya (97 Open Roles)", "Legal Jobs in
 * Kenya November 2026", "Legal & Compliance Jobs in Kenya — GoKazini" —
 * pages of dozens of postings, and the postings themselves are the
 * second click. Refusing those pages loses the jobs; reading them as
 * postings produces nothing at all.
 *
 * The awkward case is a *site* whose name contains the phrase: "Jobs in
 * Kenya .co .ke" is a board, and "Pharmacist - Postbank - Jobs in Kenya
 * .co .ke" is one posting on it. The phrase is only a listing marker
 * when it is not attached to a site name, which is what the two
 * exclusions below are for.
 */
export function isListingTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return false;

  // "Latest Vacancies", "Job Openings", "(97 Open Roles)".
  if (LISTING_TITLE.test(cleaned)) return true;

  // "Jobs by Title", "All Jobs", "Latest Jobs", "Vacancies".
  if (
    /^(?:all|latest|new|top|featured|popular|available)?\s*(?:jobs?|vacancies|openings?|positions?)\b/i.test(
      cleaned,
    )
  ) {
    return true;
  }

  // "Legal Jobs in Kenya", "Data Analyst Jobs In Nairobi 2026".
  const phrase = /\bjobs?\s+in\b/i.exec(cleaned);
  if (!phrase) return false;

  const before = cleaned.slice(0, phrase.index);
  const after = cleaned.slice(phrase.index + phrase[0].length);

  // The phrase belongs to a site name: "Pharmacist - Postbank - Jobs in
  // Kenya .co .ke".
  if (/[-–—|]\s*$/.test(before)) return false;
  if (/^\s+[A-Za-z0-9-]+\s*\.\s*[A-Za-z]{2,}/.test(after)) return false;

  return true;
}

/**
 * The words a query is built from that carry no meaning on their own.
 *
 * They are what every job query is padded with, so a result that
 * matches only these has not been matched by anything.
 */
const QUERY_FILLER = new Set([
  "a", "an", "the", "and", "or", "of", "in", "at", "on", "to", "for",
  "with", "by", "from", "is", "are", "be", "we", "our", "you", "your",
  "job", "jobs", "hiring", "hire", "role", "roles", "work", "working",
  "remote", "position", "positions", "opening", "openings", "vacancy",
  "vacancies", "apply", "now", "new", "latest", "want", "need", "looking",
  "site", "jobs", "careers", "career", "search", "find", "all", "any",
  "com", "net", "org", "www", "http", "https",
]);

/**
 * True when a result is actually about what was asked for.
 *
 * A search engine can answer with the wrong results and no way of
 * knowing: Bing answered "data analyst jobs Kenya" with results for the
 * word "data" — Wikipedia's data article, IBM's "What is data?", the
 * Merriam-Webster definition — as though only the first word had been
 * searched. Every one of those results was a real, well-formed page
 * from a well-known site, so nothing about the result itself says it is
 * wrong. Only the comparison with the query does.
 *
 * The comparison is with the *role*, not with the query. A query is
 * built as "<role> jobs <place> hiring", so the role is the run of
 * meaningful words at the front, and every word of it has to be there.
 * "Data Analyst" has to be in the result for the query to be about a
 * data analyst; "Data" alone is the first word of the wrong answer, and
 * matching it is how the wrong answer got in.
 *
 * The place and the rest of the query are not required. "Pharmacist
 * Jobs in Kenya" is the right answer to "pharmacist jobs nairobi" — a
 * posting in a different city is still a posting about a pharmacist.
 */
export function isAboutQuery(
  title: string,
  url: string,
  query: string,
): boolean {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const meaningful = words.filter(
    (word) => word.length > 2 && !QUERY_FILLER.has(word),
  );

  // A query made only of filler words gives us nothing to compare
  // against, so nothing is refused.
  if (meaningful.length === 0) return true;

  // The role is the run of meaningful words before the first piece of
  // padding. A query that starts with padding ("job openings Kenya
  // remote") has no role, and falls back to matching any one word.
  const role: string[] = [];
  for (const word of words) {
    if (word.length > 2 && !QUERY_FILLER.has(word)) {
      role.push(word);
      continue;
    }
    if (role.length > 0) break;
  }

  const haystack = `${title} ${url}`.toLowerCase();
  if (role.length === 0) {
    return meaningful.some((word) => haystack.includes(word));
  }
  return role.every((word) => haystack.includes(word));
}

/**
 * The nouns a role title is built from.
 *
 * A title that names no role is not a role title: it is a product, an
 * article or a page heading. This is the strongest signal there is,
 * because it is what the title is *for* rather than what it looks like.
 */
export const ROLE_WORDS = new Set([
  "accountant", "actuary", "actor", "administrator", "advisor", "adviser",
  "agent",
  "ambassador", "analista", "analyst", "annotator", "appraiser", "apprentice",
  "architect", "archivist",
  "artist", "assembler", "assessor", "assistant", "associate", "attendant",
  "auditor", "author",
  "babysitter", "banker", "barber", "barista", "bartender",
  "baker", "beam", "broker", "buyer", "carer", "carpenter", "cashier",
  "caterer", "ceo", "cfo", "chef", "cleaner", "clerk", "coach", "comercial",
  "consultant",
  "contractor", "controller", "coordinator", "copywriter", "counsel",
  "counsellor", "courier", "curator", "customer", "cto", "designer",
  "developer", "directeur", "director", "dispatcher", "dispenser", "driver",
  "docent",
  "editor", "electrician",
  "engineer", "estimator", "evaluator", "executive", "expert", "facilitator",
  "farmer",
  "fashion", "firefighter", "fitter", "florist", "founder", "freelance",
  "generalist", "gardener", "graduate", "guard", "head", "helper", "host",
  "infirmier", "inspector", "instructor", "intern", "internship",
  "interviewer", "ingeniero",
  "keeper", "labourer",
  "laborer", "leader", "lead", "lecturer", "librarian", "lifeguard",
  "linguist",
  "locksmith", "machinist", "manager", "marketer", "maser", "mechanic",
  "mentor", "monteur", "moderator",
  "nanny", "notary", "nurse", "officer", "ombudsman", "operative",
  "operator", "owner",
  "painter", "paralegal", "partner", "pharmacist", "photographer",
  "physician", "picker", "planner", "plumber", "porter", "praktikant",
  "praktikum", "principal", "president", "producer",
  "professional", "programador", "programmer", "proofreader", "psychologist",
  "publisher",
  "rater", "realtor", "receptionist", "recruiter", "referent", "registrar",
  "reporter",
  "representative", "responsable", "researcher", "reviewer", "roofer",
  "runner", "salesperson",
  "scientist", "secretary", "seller", "solicitor", "specialist", "staff",
  "stage", "statistician", "support",
  "stagiaire", "steward",
  "strategist", "stylist", "supervisor", "surveyor", "tailor", "teller",
  "teacher", "technician", "technicien", "technico", "technologist",
  "tekenaar", "tester", "trainee", "trainer", "translator",
  "truck", "tutor", "underwriter", "usher", "valuer",
  "vendeur", "verifier", "vp", "volunteer",
  "waiter", "waitress", "weaver", "welder", "werkstudent", "worker",
  "writer", "student",
  // The words that carry an accent are the French and German ones. They
  // are part of the word, so the rule reads them as letters and keeps
  // the accent.
  "chargé", "ingénieur", "médecin", "übersetzer",
]);

/**
 * The role words that live at the end of a compound.
 *
 * A compound puts the role at its end: "Softwareentwickler" is a
 * developer, "Steuerberater" is an adviser, "Regionalleiter" is a
 * manager, "Kreditanalyst" is an analyst, "Junior Accountmanager" is a
 * manager. The words cannot be listed — there are thousands of them —
 * so the role is found at the end of the word instead.
 *
 * Without this, a quarter of the catalogue was invisible to the rule:
 * six hundred and fifty-six of its titles carried the "(m/w/d)" marker
 * and every one of them was a title the rule could not read.
 */
export const ROLE_SUFFIXES = [
  "accountmanager",
  "administrator",
  "advisor",
  "agent",
  "analyst",
  "architect",
  "architekt",
  "assistant",
  "auditor",
  "berater",
  "betreuer",
  "broker",
  "buyer",
  "chef",
  "consultant",
  "coordinator",
  "developer",
  "designer",
  "director",
  "driver",
  "einkäufer",
  "elektroniker",
  "editor",
  "engineer",
  "entwickler",
  "executive",
  "ingenieur",
  "inspector",
  "instructor",
  "kosmetiker",
  "leiter",
  "lecturer",
  "librarian",
  "manager",
  "mitarbeiter",
  "monteur",
  "operator",
  "painter",
  "praktikant",
  "president",
  "prüfer",
  "referent",
  "researcher",
  "responsible",
  "sachbearbeiter",
  "scientist",
  "seller",
  "specialist",
  "supervisor",
  "technician",
  "techniker",
  "teacher",
  "trainer",
  "translator",
  "tutor",
  "welder",
  "writer",
  "werkvoorbereider",
] as const;

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
 *
 * The words are read as letters, not as ASCII: "Chargé de support" and
 * "Ingénieur d'études" are roles, and the accents are part of the
 * word.
 */
export function namesARole(title: string): boolean {
  const words = title
    .toLowerCase()
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);

  for (const word of words) {
    // "Engineers" names a role as plainly as "Engineer" does.
    const singular =
      word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word;

    for (const candidate of new Set([word, singular])) {
      if (ROLE_WORDS.has(candidate)) return true;
      for (const suffix of ROLE_SUFFIXES) {
        if (candidate.endsWith(suffix)) return true;
      }
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

  // A listing is a listing however the site name is attached: "Sales
  // Representative Jobs In Kenya 2026 | Latest Vacancies" is a page of
  // many jobs, not a job.
  if (LISTING_TITLE.test(cleaned)) return null;

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

  // The title has to name a role. "Sales De Baño Epsom 300g Green
  // Harmony" is a product; "Senior Data Analyst" is a job.
  if (!namesARole(cleaned)) return null;

  return cleaned;
}
