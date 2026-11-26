"use client";

import { ExternalLink, Monitor, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge, Button, Spinner } from "@/components/ui";

interface Props {
  frameUrl: string | null;
  url: string;
  title: string;
  mode: "remote_browser" | "companion_tab";
  busy: boolean;
  onRefresh: () => void;
  onReturnToStart: () => void;
}

/** The live surface. A polled screenshot, never a framed employer page. */
export function LiveFrame({
  frameUrl,
  url,
  title,
  mode,
  busy,
  onRefresh,
  onReturnToStart,
}: Props) {
  return (
    <section
      id="guided-frame"
      aria-labelledby="guided-frame-title"
      className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-app-lg border border-app-border bg-app-surface-solid"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-app-border px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Monitor size={16} className="shrink-0 text-app-accent" aria-hidden />
          <div className="min-w-0">
            <h2 id="guided-frame-title" className="text-[0.9rem] font-semibold text-app-text">
              Live browser view
            </h2>
            <p className="truncate text-[0.72rem] text-app-muted" title={url || title}>
              {url || "Waiting for the employer page"}
            </p>
          </div>
        </div>
        <Badge tone={mode === "remote_browser" ? "accent" : "warning"} dot>
          {mode === "remote_browser" ? "Private browser" : "Companion tab"}
        </Badge>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={14} aria-hidden />}
            disabled={busy || mode !== "remote_browser"}
            onClick={onRefresh}
          >
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || mode !== "remote_browser"}
            onClick={onReturnToStart}
          >
            Start page
          </Button>
        </div>
      </div>

      <div className="relative aspect-[16/10] w-full shrink-0 bg-app-elevated lg:aspect-auto lg:min-h-0 lg:flex-1">
        {mode === "companion_tab" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <ExternalLink size={26} className="text-app-accent" aria-hidden />
            <div className="max-w-md space-y-2">
              <h3 className="text-[1rem] font-semibold text-app-text">
                Keep the employer page in your own browser
              </h3>
              <p className="text-[0.85rem] leading-relaxed text-app-muted">
                Some sites require your existing login or refuse automated browsers. Open the
                site in a new tab, then use the checklist beside it. We cannot see what happens
                in your tab — tell us what changed and confirm each step yourself.
              </p>
            </div>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-app-md border border-app-accent/50 bg-app-accent/12 px-4 text-[0.85rem] font-semibold text-app-accent hover:bg-app-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
              >
                Open employer site
                <ExternalLink size={14} aria-hidden />
              </a>
            ) : null}
          </div>
        ) : frameUrl ? (
          // A blob URL from the runtime, not a framed third-party document.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frameUrl}
            alt={`Current view of ${title || "the employer application page"}`}
            className="absolute inset-0 size-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <Spinner size={22} />
            <p className="max-w-sm text-[0.85rem] leading-relaxed text-app-muted">
              {busy
                ? "Opening an isolated browser and loading the employer page…"
                : "The private browser is starting. You will see a live screenshot here."}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-app-border px-4 py-2.5 text-[0.72rem] text-app-muted">
        <ShieldCheck size={13} className="text-app-success" aria-hidden />
        <span>Screenshots only · no cookies or logins are inherited</span>
      </div>
    </section>
  );
}
