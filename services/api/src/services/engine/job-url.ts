/**
 * Whether an address is worth reading as a job posting.
 *
 * The queue is filled by search engines and by careers pages, and both
 * put things in it that are not postings: an Amazon help page, an
 * Indeed search, a LinkedIn profile, an examination board's news page.
 * Every one of them costs a request, and every one of them yields
 * nothing.
 *
 * The rules here are deliberately narrow. A URL is refused only when
 * it is *known* not to be a posting — a help page, a policy page, a
 * host we are not allowed to read — and never because the shape is
 * unfamiliar. A posting whose address is a bare slug ("/jobs/
 * tier-1-support-agent") is still a posting, and refusing it would
 * throw away the majority of the roles the catalogue holds.
 */

/**
 * The hosts that never serve a posting to us.
 *
 * They are not blocked for what they hold but for what they will not
 * give: a social network's own pages are behind a sign-in, and the
 * robots file says no. Reading them is a request spent for a refusal.
 */
const UNREADABLE_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "pinterest.com",
  "reddit.com",
  "whatsapp.com",
  "telegram.me",
  "t.me",
];

/**
 * The path fragments that are never a posting.
 *
 * A help page, a policy page, a sign-in page and a category index are
 * all pages of a site, and none of them is a vacancy.
 */
const NEVER_A_POSTING = [
  /^\/?(help|helpcenter|help-centre|support|customer[-_]?service|customer-service|gp\/help)(\/|$)/i,
  /^\/?(privacy|privacy-policy|privacy-notice|terms|terms-of-use|terms-and-conditions|legal|licenses?|cookies?|cookie-policy|gdpr)(\/|$)/i,
  /^\/?(faq|faqs|about|about-us|contact|contact-us|newsletter|press|media|advertise|advertising|partners?)([/?]|$)/i,
  /^\/?(login|log-in|signin|sign-in|signup|sign-up|register|registration|auth|oauth|callback|account|my-account|settings|preferences)(\/|$)/i,
  /^\/?(cart|checkout|basket|payment|order|orders|wishlist|wish-list|search|search-results|explore|discover|browse)(\/|$)/i,
  /^\/?(sitemap|robots)\.xml$/i,
  /^\/?(categories|category|tags?|topics?|authors?|archives?)(\/|$)/i,
  /^\/?(news|news-and-careers|blog|articles?|press-releases?)(\/|$)/i,
  /^\/?(exams?|quiz|quizzes|test|tests|practice|results|answers?)(\/|$)/i,
  /^\/?(download|downloads|uploads?|assets|static|media)(\/|$)/i,
  /\/(help|privacy|terms|faq|contact|login|signin|register)\.html?$/i,
];

/**
 * True when the host is one we cannot read postings from.
 */
export function isUnreadableHost(rawUrl: string): boolean {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  return UNREADABLE_HOSTS.some(
    (blocked) => host === blocked || host.endsWith(`.${blocked}`),
  );
}

/**
 * True when the address could be a posting's address.
 *
 * A refusal is a statement about the *shape* of the address, never
 * about the job it might hold: an unfamiliar shape is allowed through,
 * because the page itself is the authority on what it is.
 */
export function looksLikeJobUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (isUnreadableHost(rawUrl)) return false;

  const path = url.pathname;
  if (!path || path === "/") return false;

  // A query-only address is a search, not a posting.
  if (path === "/" && url.search) return false;

  return !NEVER_A_POSTING.some((pattern) => pattern.test(path));
}

/**
 * Why an address was refused, for the queue's own record.
 */
export function jobUrlRefusal(rawUrl: string): string | null {
  if (isUnreadableHost(rawUrl)) return "HOST_NOT_READABLE";
  if (!looksLikeJobUrl(rawUrl)) return "NOT_A_JOB_URL";
  return null;
}
