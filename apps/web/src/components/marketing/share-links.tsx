"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Link2, MessageCircle, Share2 } from "lucide-react";

/**
 * Share a role to another platform, always carrying a link back to MboQara so
 * the recipient lands on our site rather than the employer's.
 */
export function ShareLinks({ title, company }: { title: string; company: string }) {
  const [copied, setCopied] = useState(false);
  // The share target is the current URL, which only exists in the browser.
  // Reading it after mount keeps the server and client markup identical.
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(window.location.href);
  }, []);

  if (!url) {
    return <div className="jr-share" aria-label={`Share ${title}`} role="group" />;
  }

  const text = `${title} at ${company} — found on MboQara`;

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  const twitter = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeComponentSafe(url)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="jr-share" aria-label={`Share ${title}`} role="group">
      <button
        type="button"
        onClick={copy}
        className="jr-share__btn"
        aria-label={copied ? "Link copied" : "Copy link"}
        title="Copy link"
      >
        <Link2 aria-hidden="true" />
      </button>
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        className="jr-share__btn jr-share__btn--whatsapp"
        aria-label={`Share ${title} on WhatsApp`}
        title="WhatsApp"
      >
        <MessageCircle aria-hidden="true" />
      </a>
      <a
        href={telegram}
        target="_blank"
        rel="noopener noreferrer"
        className="jr-share__btn"
        aria-label={`Share ${title} on Telegram`}
        title="Telegram"
      >
        <Share2 aria-hidden="true" />
      </a>
      <a
        href={linkedin}
        target="_blank"
        rel="noopener noreferrer"
        className="jr-share__btn"
        aria-label={`Share ${title} on LinkedIn`}
        title="LinkedIn"
      >
        <Share2 aria-hidden="true" />
      </a>
      <a
        href={twitter}
        target="_blank"
        rel="noopener noreferrer"
        className="jr-share__btn"
        aria-label={`Share ${title} on X`}
        title="X"
      >
        <Share2 aria-hidden="true" />
      </a>
    </div>
  );
}

/** encodeURIComponent already exists; this keeps the call site readable. */
function encodeComponentSafe(value: string): string {
  return encodeURIComponent(value);
}
