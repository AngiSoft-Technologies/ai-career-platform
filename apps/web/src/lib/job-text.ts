/**
 * Cleanup for descriptions that came from third-party job boards.
 *
 * A source page can put its filters, company profile, other vacancies and
 * pagination in the same element as the posting. The API now removes most of
 * that before storage, but older rows still contain it, so the detail view
 * applies the same boundary rules on the way out.
 */

const UNSAFE_MARKDOWN_LINK = /\[([^\]]+)\]\((?!https?:\/\/)[^)]*\)/g;

const CHROME_LINE = [
  /^\[?(?:jobs|career advice|post job|search for jobs|detailed search|close)\]?$/i,
  /^(?:follow this company|industry|founded|type|website|address)\b/i,
  /^\d+$/,
  /^\[\d+\]\([^)]*\)$/,
  /^- \[!\[/,
  /^- ### \[/,
  /^\d{1,2}\s+[A-Z][a-z]+\s*$/,
  /related companies hiring now/i,
  /^view all jobs\b/i,
  /^anonymously add review\b/i,
  /^view salary structure\b/i,
  /^no review available\b/i,
  /^average salary\b/i,
  /^about [A-Z][\w&.' -]{1,60}\b/i,
  /jobs? in (?:kenya|africa).*vacanc/i,
];

/** Glued filter labels such as "NairobiMombasaBaringo" are not prose. */
const GLUED_NAV = /(?:[A-Z][A-Za-z]{2,}){5,}/;

const ROLE_START =
  /\b(job purpose statement|about the role|about this role|about the job|job description|role description|the role|what you(?:'|’)?ll do|what you will do|what we are looking for|key accountabilities|responsibilities|requirements|qualifications)\b/i;

const ROLE_END =
  /\b(related companies hiring now|view all jobs|follow this company|no review available|average salary|salary structure)\b/i;

export function normaliseJobText(value: string): string {
  let text = (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(UNSAFE_MARKDOWN_LINK, "$1");

  text = text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (GLUED_NAV.test(trimmed)) return false;
      return !CHROME_LINE.some((pattern) => pattern.test(trimmed));
    })
    .join("\n");

  const start = ROLE_START.exec(text);
  if (start && start.index > 0) text = text.slice(start.index);

  const end = ROLE_END.exec(text);
  if (end && end.index > 0) text = text.slice(0, end.index);

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * A long posting becomes a short read with a native disclosure for the rest.
 * The cut prefers paragraph, then line, then sentence boundaries so the
 * preview never ends halfway through a word.
 */
export function splitJobText(
  text: string,
  limit = 1_800,
): { preview: string; rest: string } {
  if (text.length <= limit) return { preview: text, rest: "" };

  const lowerBound = Math.floor(limit / 2);
  const searchArea = text.slice(0, limit + 400);

  const paragraph = searchArea.lastIndexOf("\n\n", limit);
  const line = searchArea.lastIndexOf("\n", limit);
  const sentence = searchArea.lastIndexOf(". ", limit);

  let cut = limit;
  if (paragraph > lowerBound) cut = paragraph + 2;
  else if (line > lowerBound) cut = line + 1;
  else if (sentence > lowerBound) cut = sentence + 2;

  return {
    preview: text.slice(0, cut).trim(),
    rest: text.slice(cut).trim(),
  };
}
