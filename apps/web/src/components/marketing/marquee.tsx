"use client";

import { Radio } from "lucide-react";

/**
 * A strip of live facts, moving.
 *
 * A page that sits still reads as a document; a slow marquee of live
 * figures says the platform is doing something right now. It pauses on
 * hover (the track's animation-play-state), stops entirely under
 * prefers-reduced-motion, and the list is duplicated so the loop has no
 * seam — with the duplicate hidden from assistive technology, because a
 * screen reader reading it once is reading it enough.
 */
export function Marquee({ items }: { items: string[] }) {
  const track = (
    <>
      {items.map((item) => (
        <span className="mk-marquee__item" key={item}>
          <Radio aria-hidden="true" />
          {item}
        </span>
      ))}
    </>
  );

  return (
    <div className="mk-marquee" style={{ borderBlock: "1px solid var(--mk-border)", padding: "16px 0", background: "var(--mk-bg-elevated)" }}>
      <div className="mk-marquee__track">
        {track}
        <span aria-hidden="true" style={{ display: "contents" }}>
          {track}
        </span>
      </div>
    </div>
  );
}
