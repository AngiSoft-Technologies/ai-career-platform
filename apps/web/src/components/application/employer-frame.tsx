"use client";

import { useState } from "react";
import { ExternalLink, PanelsTopLeft, RotateCw } from "lucide-react";
import { Button, cx } from "@/components/ui";

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function EmployerFrame({
  url,
  title,
  defaultOpen = true,
}: {
  url: string;
  title: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [reloadKey, setReloadKey] = useState(0);
  const safe = safeUrl(url);

  if (!safe) {
    return (
      <div className="rounded-app-md border border-dashed border-app-border px-4 py-8 text-center text-[0.82rem] leading-relaxed text-app-muted">
        This application is handled by email. The agent will prepare the message and documents instead of embedding a page.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-app-md border border-app-border bg-app-surface-2/35">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border bg-app-surface px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <PanelsTopLeft size={15} className="shrink-0 text-app-accent" />
          <div className="min-w-0">
            <p className="truncate text-[0.8rem] font-medium text-app-text">Employer application</p>
            <p className="truncate text-[0.69rem] text-app-muted">{title}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={<RotateCw size={13} />}
            aria-label="Reload employer page"
            onClick={() => setReloadKey((value) => value + 1)}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Hide page" : "Show page"}
          </Button>
          <a href={safe} target="_blank" rel="noopener noreferrer">
            <Button type="button" size="sm" variant="ghost" icon={<ExternalLink size={13} />}>
              Separate tab
            </Button>
          </a>
        </div>
      </div>
      {open ? (
        <iframe
          key={reloadKey}
          className={cx("h-[560px] w-full bg-white")}
          title={`Employer application for ${title}`}
          src={safe}
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-forms allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
        />
      ) : null}
      <p className="border-t border-app-border px-4 py-2.5 text-[0.72rem] leading-relaxed text-app-muted">
        The employer page opens here by default. Some application systems refuse
        to be embedded; if the frame stays blank, use the separate-tab fallback.
        Your MboQara workspace remains open alongside it.
      </p>
    </div>
  );
}
