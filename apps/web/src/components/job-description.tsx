"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui";

/**
 * Job descriptions arrive as scraped text: some are plain paragraphs, most
 * are Markdown, a few are Markdown with HTML-ish headings. Rendering them
 * with `whitespace-pre-wrap` put literal `##` and `**` on screen, which made
 * every posting look like a data export rather than a document.
 *
 * This is a deliberately small renderer, not a general Markdown engine: it
 * covers headings, ordered and unordered lists, rules, emphasis, links and
 * paragraphs, and escapes everything else. No raw HTML is passed through.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(value: string): string {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:)]|$)/g, "$1<em>$2</em>");
}

type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "hr" };

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

    // A short line on its own followed by a rule is a heading in some feeds;
    // treat `Title:`-only lines as headings too, since many ATS exports use
    // them as section markers.
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
      // A wrapped list item.
      list.items[list.items.length - 1] = `${list.items[list.items.length - 1]} ${trimmed}`;
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}

export function JobDescription({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const blocks = parse(text ?? "");

  return (
    <div className={cx("max-w-[68ch] text-[0.95rem] leading-[1.75] text-app-soft", className)}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "h": {
            const Element = (block.level <= 2 ? "h2" : "h3") as "h2" | "h3";
            return (
              <Element
                key={index}
                className={cx(
                  "text-app-text first:mt-0",
                  block.level <= 2
                    ? "mt-8 mb-2.5 font-display text-[1.25rem] leading-tight font-semibold tracking-[-0.015em]"
                    : "mt-6 mb-2 text-[1rem] leading-snug font-semibold",
                )}
                dangerouslySetInnerHTML={{ __html: inline(block.text) }}
              />
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
                    <span dangerouslySetInnerHTML={{ __html: inline(item) }} />
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
                    <span dangerouslySetInnerHTML={{ __html: inline(item) }} />
                  </li>
                ))}
              </ol>
            );
          default:
            return (
              <p
                key={index}
                className="my-3"
                dangerouslySetInnerHTML={{ __html: inline(block.text) }}
              />
            );
        }
      })}
    </div>
  );
}

/** Renders a short inline string (a title, a note) with the same emphasis rules. */
export function Inline({ text, className }: { text: string; className?: string }): ReactNode {
  return <span className={className} dangerouslySetInnerHTML={{ __html: inline(text) }} />;
}
