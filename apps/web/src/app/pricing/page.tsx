import ClientPage from "./client-page";
import { metadata } from "./page-metadata";
import { fetchPublicContent } from "@/lib/server-content";
import { JsonLd, breadcrumbSchema, softwareApplicationSchema, webPageSchema } from "@/components/seo/json-ld";

export { metadata };
export const revalidate = 300;

interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

interface PlanContent {
  id: string;
  name: string;
  badge: string;
  price: number;
  period: string;
  description: string;
  features: Array<{ id: string; label: string; included: boolean }>;
  ctaLabel: string;
  ctaHref: string;
}

export default async function Page() {
  const [hero, plans] = await Promise.all([
    fetchPublicContent<HeroContent>("/content/pricing/hero"),
    fetchPublicContent<PlanContent[]>("/content/pricing/plans"),
  ]);

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "Pricing — free founding access during beta",
            description:
              "MboQara is free during beta. Founding members get every feature — job search, matching, CV and cover letter drafting, application tracking — free for life.",
            path: "/pricing",
          }),
          softwareApplicationSchema(),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Pricing", path: "/pricing" },
          ]),
        ]}
      />
      <ClientPage initialHero={hero} initialPlans={plans} />
    </>
  );
}
