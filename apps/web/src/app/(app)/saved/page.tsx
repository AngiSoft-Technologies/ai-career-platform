"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Bookmark } from "lucide-react";
import {
  Button,
  EmptyState,
  Page,
  PageHeader,
  Panel,
  Skeleton,
} from "@/components/ui";
import { EmptySearchArt } from "@/components/app-art";
import { OpportunityRow } from "@/components/discovery/opportunity-row";
import { sceneForPath } from "@/lib/app-scenes";
import { useApi } from "@/lib/hooks";
import type { SavedOpportunity } from "@angisoft/mboqara-contracts";

interface SavedResponse {
  items: SavedOpportunity[];
}

export default function SavedPage() {
  const saved = useApi<SavedResponse>("/feed/state/saved", { limit: 200 });
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const scene = sceneForPath("/saved");

  const items = (saved.data?.items ?? []).filter(
    (entry) => !removed.has(entry.opportunity.id),
  );

  const updateSaved = (id: string, value: boolean) => {
    setRemoved((previous) => {
      const next = new Set(previous);
      if (value) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Discovery"
        title="Saved roles"
        description="A wish list of the roles you want to return to. Open a row for the full posting, or remove it when you are done."
        art={{ src: scene.src, alt: scene.alt, caption: scene.caption }}
        meta={
          saved.data ? (
            <span className="font-mono text-[0.66rem] tracking-[0.16em] uppercase">
              {items.length} saved
            </span>
          ) : null
        }
        actions={
          <Link href="/workspace/opportunities">
            <Button size="sm" icon={<ArrowUpRight size={14} />}>
              Browse opportunities
            </Button>
          </Link>
        }
      />

      {saved.loading && !saved.data ? (
        <Panel className="divide-y divide-app-border">
          {Array.from({ length: 4 }).map((_, row) => (
            <div key={row} className="flex items-center gap-4 px-5 py-5">
              <Skeleton height={46} width={46} className="rounded-app-md" />
              <div className="flex-1">
                <Skeleton height={15} width="48%" />
                <div className="mt-2.5 flex gap-2">
                  <Skeleton height={11} width="22%" />
                  <Skeleton height={11} width="18%" />
                </div>
              </div>
            </div>
          ))}
        </Panel>
      ) : saved.error && !saved.data ? (
        <EmptyState
          icon={<Bookmark size={26} />}
          title="Could not load saved roles"
          description={saved.error}
          action={
            <Button size="sm" variant="outline" onClick={saved.refresh}>
              Try again
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<EmptySearchArt />}
          title="Nothing saved yet"
          description="Save a role from the catalogue or the daily list and it will appear here, with the date you saved it."
          action={
            <Link href="/workspace/opportunities">
              <Button size="sm">Find roles to save</Button>
            </Link>
          }
        />
      ) : (
        <Panel className="overflow-visible">
          <ul className="divide-y divide-app-border">
            {items.map((entry) => (
              <OpportunityRow
                key={entry.opportunity.id}
                item={entry.opportunity}
                saved
                savedAt={entry.savedAt}
                onSavedChange={(value) => updateSaved(entry.opportunity.id, value)}
              />
            ))}
          </ul>
        </Panel>
      )}
    </Page>
  );
}
