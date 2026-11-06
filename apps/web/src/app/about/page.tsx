import ClientPage, {
  type BenefitContent,
  type HeroContent,
  type TestimonialContent,
} from "./client-page";
import { metadata } from "./page-metadata";
import { fetchPublicContent } from "@/lib/server-content";
import {
  JsonLd,
  breadcrumbSchema,
  organizationSchema,
  webPageSchema,
} from "@/components/seo/json-ld";

export { metadata };
export const revalidate = 300;

export default async function Page() {
  const [hero, benefits, stories] = await Promise.all([
    fetchPublicContent<HeroContent>("/content/about/hero"),
    fetchPublicContent<BenefitContent[]>("/content/about/benefits"),
    fetchPublicContent<TestimonialContent[]>("/content/stories"),
  ]);

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "About MboQara — a career platform built around job seekers",
            description:
              "MboQara is built by AngiSoft Technologies in Nairobi, Kenya. Discover jobs worldwide, understand your fit, prepare role-focused CVs and cover letters, and keep every application in one workspace.",
            path: "/about",
            type: "AboutPage",
          }),
          organizationSchema(),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "About", path: "/about" },
          ]),
        ]}
      />
      <ClientPage
        initialHero={hero}
        initialBenefits={benefits}
        initialStories={stories}
      />
    </>
  );
}
