import ClientPage from "./client-page";
import { SECURITY_KEYWORDS, pageMetadata } from "@/lib/seo";
import { fetchPublicContent } from "@/lib/server-content";
import { JsonLd, breadcrumbSchema, webPageSchema } from "@/components/seo/json-ld";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Privacy Policy — how MboQara handles your CV, profile and applications",
  description:
    "MboQara privacy: what data is stored, how it is used, AI-assisted features, service providers, and your choices. No selling of your CV, no third-party AI training.",
  path: "/privacy",
  keywords: SECURITY_KEYWORDS,
});

interface PrivacySection {
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
    fetchPublicContent<HeroContent>("/content/privacy/hero"),
    fetchPublicContent<PrivacySection[]>("/content/privacy"),
  ]);

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "MboQara Privacy Policy",
            description:
              "What data the MboQara job search and application tracker stores, how it is used, and the choices you have — no selling of CVs and no third-party AI training.",
            path: "/privacy",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Privacy", path: "/privacy" },
          ]),
        ]}
      />
      <ClientPage initialHero={hero} initialSections={sections} />
    </>
  );
}
