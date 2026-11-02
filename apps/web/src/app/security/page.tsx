import ClientPage from "./client-page";
import { metadata } from "./page-metadata";
import { fetchPublicContent } from "@/lib/server-content";
import { JsonLd, breadcrumbSchema, webPageSchema } from "@/components/seo/json-ld";

export { metadata };
export const revalidate = 300;

interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

interface SecuritySection {
  id: string;
  title: string;
  body: string;
}

export default async function Page() {
  const [hero, sections] = await Promise.all([
    fetchPublicContent<HeroContent>("/content/security/hero"),
    fetchPublicContent<SecuritySection[]>("/content/security"),
  ]);

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "Privacy and security — MboQara",
            description:
              "MboQara keeps your profile, CVs and application documents private: encrypted access, time-limited document links, no data selling, no third-party AI training.",
            path: "/security",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Security", path: "/security" },
          ]),
        ]}
      />
      <ClientPage initialHero={hero} initialSections={sections} />
    </>
  );
}
