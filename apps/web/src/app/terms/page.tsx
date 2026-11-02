import ClientPage from "./client-page";
import { pageMetadata } from "@/lib/seo";
import { fetchPublicContent } from "@/lib/server-content";
import { JsonLd, breadcrumbSchema, webPageSchema } from "@/components/seo/json-ld";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Terms of Service — MboQara beta, generated content and your applications",
  description:
    "MboQara terms: using the beta service, third-party listings, AI-generated documents, your application decisions and pricing. Free during founding access.",
  path: "/terms",
  keywords: ["MboQara terms", "job app terms", "terms of service Kenya", "beta service terms", "AI content terms"],
});

interface TermsSection {
  id: string;
  title: string;
  body: string;
}

interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

export default async function Page() {
  const [hero, sections] = await Promise.all([
    fetchPublicContent<HeroContent>("/content/terms/hero"),
    fetchPublicContent<TermsSection[]>("/content/terms"),
  ]);

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "MboQara Terms of Service",
            description:
              "Terms covering the MboQara beta service, third-party job listings, AI-generated documents, application decisions and pricing.",
            path: "/terms",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Terms", path: "/terms" },
          ]),
        ]}
      />
      <ClientPage initialHero={hero} initialSections={sections} />
    </>
  );
}
