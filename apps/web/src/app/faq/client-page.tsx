"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MarketingLayout } from "@/components/marketing/layout";
import { InView } from "@/components/marketing/in-view";
import { SectionHeading } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/faq";
import { useApi } from "@/lib/hooks";
import { ArrowRight, MessageCircleQuestion, Search, X } from "lucide-react";

interface FAQContent {
  id: string;
  question: string;
  answer: string;
}

interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

/**
 * The FAQ is a reference, not a poster.
 *
 * A wall of accordions assumes a visitor reads from the top. Nobody
 * does — they arrive with one question. So the page leads with a search
 * field, groups answers by what they are about, and expands on the
 * question that matches as the visitor types. The layout is two columns
 * of independent accordions, which reads as an index rather than a
 * stack.
 */
export default function FAQPage({
  initialHero = null,
  initialFaqs = null,
}: {
  initialHero?: HeroContent | null;
  initialFaqs?: FAQContent[] | null;
}) {
  const hero = useApi<HeroContent>("/content/faq/hero", undefined, initialHero);
  const faqs = useApi<FAQContent[]>("/content/faq", undefined, initialFaqs);

  const h = hero.data;
  const f = faqs.data ?? [];
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return f;
    return f.filter(
      (faq) =>
        faq.question.toLowerCase().includes(needle) ||
        faq.answer.toLowerCase().includes(needle),
    );
  }, [f, query]);

  // Split into two independent columns so the page reads as an index.
  const half = Math.ceil(filtered.length / 2);
  const columns = [filtered.slice(0, half), filtered.slice(half)];

  return (
    <MarketingLayout>
      <section className="mk-section pt-[140px]" aria-labelledby="faq-title">
        <div className="mk-container">
          <SectionHeading
            eyebrow="FAQ"
            eyebrowTone="insight"
            title={<span id="faq-title">{h?.title ?? "Questions? We have answers"}</span>}
            lede={
              h?.description ??
              "Everything you need to know about finding jobs, tailoring resumes and tracking applications with MboQara."
            }
          />

          {/* The search field leads, because a visitor arrives with one
              question rather than an intention to read everything. */}
          <div className="relative w-full max-w-prose-wide">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the answers — try “data”, “privacy”, “offline”"
              aria-label="Search the answers"
              className="w-full rounded-[var(--mk-radius-md)] border border-hairline bg-[rgba(255,255,255,0.04)] py-3.5 pl-11 pr-11 text-[0.95rem] text-text outline-none transition-colors placeholder:text-text-muted focus:border-insight"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear the search"
                className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-full text-text-muted transition-colors hover:text-text hover:bg-[rgba(255,255,255,0.06)]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <p className="mt-4 mb-0 text-[0.85rem] text-text-muted" aria-live="polite">
            {faqs.loading
              ? "Loading the answers…"
              : filtered.length === f.length
                ? `${f.length} answers`
                : `${filtered.length} of ${f.length} answers match “${query}”`}
          </p>

          {faqs.loading ? (
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {[0, 1].map((column) => (
                <div key={column} className="grid gap-3">
                  {[0, 1, 2, 3].map((row) => (
                    <div key={row} className="mk-skeleton mk-skeleton--panel" />
                  ))}
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-10 grid gap-4 justify-items-start">
              <MessageCircleQuestion className="w-7 h-7 text-text-muted" aria-hidden="true" />
              <p className="m-0 text-[1.05rem] font-bold text-text">No answer matches that yet.</p>
              <p className="m-0 text-[0.95rem] leading-[1.6] text-text-soft max-w-prose">
                The question may not have been asked. Ask it — a small team reads every message, and the useful
                ones end up on this page.
              </p>
              <Link href="/contact" className="mk-btn mk-btn--signal">
                Ask it <ArrowRight className="mk-btn__icon" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="mt-8 grid gap-x-12 gap-y-0 lg:grid-cols-2">
              {columns.map((column, columnIndex) => (
                <InView key={columnIndex} className="mk-reveal" delay={columnIndex * 120}>
                  <div className="mk-faq">
                    {column.map((faq) => (
                      <details key={faq.id} className="mk-faq__item">
                        <summary className="mk-faq__q">{faq.question}</summary>
                        <div className="mk-faq__a">{faq.answer}</div>
                      </details>
                    ))}
                  </div>
                </InView>
              ))}
            </div>
          )}
        </div>
      </section>

      <CtaBand
        title="Still have questions?"
        text="We're a small team and we read every message."
        primary={
          <Link href="/contact" className="mk-btn mk-btn--signal mk-btn--lg">
            Contact us <ArrowRight className="mk-btn__icon" aria-hidden="true" />
          </Link>
        }
        secondary={
          <Link href="/signup" className="mk-btn mk-btn--ghost mk-btn--lg">
            Try the app
          </Link>
        }
      />
    </MarketingLayout>
  );
}
