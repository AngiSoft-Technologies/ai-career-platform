import ClientPage from "./client-page";
import { metadata } from "./page-metadata";
import { fetchFeaturedJobs, fetchPublicContent } from "@/lib/server-content";
import {
  JsonLd,
  breadcrumbSchema,
  organizationSchema,
  softwareApplicationSchema,
  webPageSchema,
  websiteSchema,
} from "@/components/seo/json-ld";
import { SITE } from "@/lib/seo";

export { metadata };
export const revalidate = 120;

interface Benefit {
  id: string;
  title: string;
  body: string;
  icon: string;
}

interface ComparisonContent {
  columns: Array<{ label: string; items: string[]; check: boolean }>;
}

interface FeaturedJobs {
  jobs: Array<{
    id: string;
    title: string;
    company: string;
    city: string;
    country: string;
    workMode: string;
    seniority: string;
    salaryMin: number | null;
    salaryMax: number | null;
    currency: string | null;
  }>;
}

export default async function Page() {
  const [benefits, comparison, featuredJobs] = await Promise.all([
    fetchPublicContent<Benefit[]>("/content/benefits"),
    fetchPublicContent<ComparisonContent>("/content/comparison"),
    fetchFeaturedJobs<FeaturedJobs>(),
  ]);

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: `MboQara — ${SITE.tagline}`,
            description:
              "Find live jobs and employment opportunities worldwide, see how each one fits your profile, tailor your CV, resume and cover letter, and track every application.",
            path: "/",
          }),
          organizationSchema(),
          websiteSchema(),
          softwareApplicationSchema(),
          breadcrumbSchema([{ name: "Home", path: "/" }]),
        ]}
      />
      <ClientPage
        initialBenefits={benefits}
        initialComparison={comparison}
        initialFeaturedJobs={featuredJobs}
      />
    </>
  );
}
