import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";
import { fetchFeaturedJobs } from "@/lib/server-content";

/**
 * Public marketing routes and canonical job detail pages. Authenticated app
 * routes and the job listing/search page are excluded on purpose (see
 * robots.ts and Google's JobPosting guidance).
 */
const routes: Array<{
  path: string;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
}> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/features", changeFrequency: "monthly", priority: 0.9 },
  { path: "/faq", changeFrequency: "weekly", priority: 0.8 },
  { path: "/guides", changeFrequency: "monthly", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/careers", changeFrequency: "monthly", priority: 0.5 },
  { path: "/security", changeFrequency: "monthly", priority: 0.6 },
  { path: "/accessibility", changeFrequency: "yearly", priority: 0.4 },
  { path: "/download", changeFrequency: "monthly", priority: 0.7 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.5 },
  { path: "/cookies", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/consent-choices", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/acceptable-use", changeFrequency: "yearly", priority: 0.3 },
];

interface FeaturedJobsFeed {
  jobs: Array<{
    id: string;
    postedAt?: string | null;
    expiresAt?: string | null;
  }>;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const publicPages = routes.map((route) => ({
    url: `${SITE.url}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const featured = await fetchFeaturedJobs<FeaturedJobsFeed>(120);
  const jobPages = (featured?.jobs ?? []).map((job) => {
    const modified = job.postedAt ? new Date(job.postedAt) : lastModified;
    return {
      url: `${SITE.url}/opportunities/${encodeURIComponent(job.id)}`,
      lastModified: Number.isNaN(modified.getTime()) ? lastModified : modified,
      changeFrequency: "daily" as const,
      priority: 0.7,
    };
  });

  return [...publicPages, ...jobPages];
}
