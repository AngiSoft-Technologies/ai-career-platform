import "server-only";

import { cache } from "react";
import type { FeaturedJob, PublicOpportunity } from "./types";

/**
 * Server-side fetchers for public marketing content.
 *
 * The marketing pages used to fetch this content only in the browser, which
 * meant crawlers and AI assistants saw empty sections. Fetching on the server
 * puts the real copy in the initial HTML while keeping the API as the single
 * source of truth (revalidated every few minutes).
 */
const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.mboqara.angisoft.co.ke/v1"
).replace(/\/$/, "");

async function getJson<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Fetch a `/v1/content/*` document. Returns null on failure so callers can fall back. */
export function fetchPublicContent<T>(
  path: string,
  revalidate = 300,
): Promise<T | null> {
  const clean = path.replace(/^\/+/, "");
  return getJson<T>(`${API_URL}/content/${clean}`, revalidate);
}

/** Fetch the public featured-jobs feed shown on the landing page. */
export function fetchFeaturedJobs<T>(revalidate = 120): Promise<T | null> {
  return getJson<T>(`${API_URL}/public/featured`, revalidate);
}

/**
 * Fetch one complete public role. Cached with React `cache` so the page and
 * its `generateMetadata` share a single request for the same opportunity.
 */
export const fetchPublicOpportunity = cache(
  async (
    id: string,
    revalidate = 120,
  ): Promise<PublicOpportunity | null> => {
    if (!id || id.length > 128) return null;
    const payload = await getJson<{ opportunity: PublicOpportunity }>(
      `${API_URL}/public/opportunities/${encodeURIComponent(id)}`,
      revalidate,
    );
    return payload?.opportunity ?? null;
  },
);

/** Typed alias for callers that do not need a custom response shape. */
export function fetchPublicFeaturedJobs(
  revalidate = 120,
): Promise<{ jobs: FeaturedJob[]; generatedAt: string } | null> {
  return fetchFeaturedJobs<{ jobs: FeaturedJob[]; generatedAt: string }>(revalidate);
}
