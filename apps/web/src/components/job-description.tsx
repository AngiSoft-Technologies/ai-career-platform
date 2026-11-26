"use client";

import { Fragment, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { normaliseJobText, splitJobText } from "@/lib/job-text";

/**
 * A deliberately small Markdown renderer for scraped job descriptions.
 *
 * The field is Markdown: headings, lists, rules, emphasis and links. It is
 * never source HTML, and nothing here turns source HTML into markup. Inline
 * tokens are rendered as React nodes, so posting text cannot inject markup.
 */
type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "hr" };

/**
 * Section titles scraped from job boards rarely carry Markdown `#`. Without
 * this they get joined into the previous sentence as plain prose.
 */
const SECTION_LINE =
  /^(job purpose statement|about the role|about this role|about the job|job description|role description|the role|what you(?:'|’)?ll do|what you will do|what we(?:'|’)?re looking for|what we are looking for|key accountabilities|responsibilities|responsibility|duties|key duties|key responsibilities|requirements?|qualifications?|minimum requirements?|preferred qualifications?|skills(?: and experience)?|must[- ]have|you have|benefits|how to apply|about us|company description)\s*:?$/i;

function parse(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "p", text: paragraph.join(" ") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(
        list.ordered ? { kind: "ol", items: list.items } : { kind: "ul", items: list.items },
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(trimmed.replace(/\s+/g, ""))) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "hr" });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "h", level: heading[1].length, text: heading[2] });
      continue;
    }

    if (SECTION_LINE.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "h", level: 3, text: trimmed });
      continue;
    }

    const bullet = /^[-*•·]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }

    const numbered = /^(\d{1,2})[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[2]);
      continue;
    }

    if (list) {
      list.items[list.items.length - 1] = `${list.items[list.items.length - 1]} ${trimmed}`;
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}

const INLINE_TOKEN =
  /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|_([^_]+)_/g;

/** Renders the supported inline Markdown as nodes, never as HTML. */
function inline(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  INLINE_TOKEN.lastIndex = 0;

  while ((match = INLINE_TOKEN.exec(value)) !== null) {
    if (match.index > cursor) {
      nodes.push(<Fragment key={cursor}>{value.slice(cursor, match.index)}</Fragment>);
    }

    if (match[1] && match[2]) {
      nodes.push(
        <a
          key={match.index}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-app-accent underline decoration-app-border underline-offset-2"
        >
          {match[1]}
        </a>,
      );
    } else if (match[3]) {
      nodes.push(<strong key={match.index}>{match[3]}</strong>);
    } else if (match[4]) {
      nodes.push(<em key={match.index}>{match[4]}</em>);
    }

    cursor = INLINE_TOKEN.lastIndex;
  }

  if (cursor < value.length) {
    nodes.push(<Fragment key={cursor}>{value.slice(cursor)}</Fragment>);
  }
  return nodes;
}

function renderBlocks(blocks: Block[]): ReactNode {
  return blocks.map((block, index) => {
    switch (block.kind) {
      case "h": {
        const Element = (block.level <= 2 ? "h2" : "h3") as "h2" | "h3";
        return (
          <Element
            key={index}
            className={cx(
              "text-balance text-app-text first:mt-0",
              block.level <= 2
                ? "mt-8 mb-2.5 font-display text-[1.25rem] leading-tight font-semibold tracking-[-0.015em]"
                : "mt-6 mb-2 text-[1rem] leading-snug font-semibold",
            )}
          >
            {inline(block.text)}
          </Element>
        );
      }
      case "hr":
        return <hr key={index} className="my-7 border-app-border" />;
      case "ul":
        return (
          <ul key={index} className="my-3 flex flex-col gap-1.5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="relative pl-4">
                <span
                  aria-hidden
                  className="absolute top-[0.7em] left-0 size-1 rounded-full bg-app-muted"
                />
                <span>{inline(item)}</span>
              </li>
            ))}
          </ul>
        );
      case "ol":
        return (
          <ol key={index} className="my-3 flex flex-col gap-1.5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="relative pl-7">
                <span className="absolute top-[0.15em] left-0 font-mono text-[0.72rem] text-app-muted">
                  {String(itemIndex + 1).padStart(2, "0")}
                </span>
                <span>{inline(item)}</span>
              </li>
            ))}
          </ol>
        );
      default:
        return (
          <p key={index} className="my-3 text-pretty">
            {inline(block.text)}
          </p>
        );
    }
  });
}

export function JobDescription({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const cleaned = normaliseJobText(text ?? "");
  const { preview, rest } = splitJobText(cleaned);

  if (!cleaned) {
    return (
      <div className={cx("max-w-[68ch] text-[0.95rem] leading-[1.75] text-app-muted", className)}>
        No description was provided by the source.
      </div>
    );
  }

  return (
    <div
      className={cx(
        "max-w-[68ch] break-words text-[0.95rem] leading-[1.75] text-app-soft",
        className,
      )}
    >
      {renderBlocks(parse(preview))}
      {rest ? (
        <details className="mt-5 border-t border-app-border pt-4">
          <summary className="w-fit cursor-pointer text-[0.82rem] font-medium text-app-accent marker:text-app-accent">
            Show full posting
          </summary>
          <div className="mt-3">{renderBlocks(parse(rest))}</div>
        </details>
      ) : null}
    </div>
  );
}

/** Renders a short inline string (a title, a note) with the same Markdown rules. */
export function Inline({ text, className }: { text: string; className?: string }): ReactNode {
  return <span className={className}>{inline(text ?? "")}</span>;
}
