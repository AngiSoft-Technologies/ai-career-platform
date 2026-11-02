import ClientPage from "./client-page";
import { metadata } from "./page-metadata";
import { fetchPublicContent } from "@/lib/server-content";
import { FAQ_ITEMS } from "@/lib/faq";
import { JsonLd, breadcrumbSchema, faqSchema, webPageSchema } from "@/components/seo/json-ld";

export { metadata };
export const revalidate = 300;

interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

interface FAQContent {
  id: string;
  question: string;
  answer: string;
}

/** Server-rendered questions and answers keep the FAQ indexable. */
export default async function Page() {
  const [hero, faqs] = await Promise.all([
    fetchPublicContent<HeroContent>("/content/faq/hero"),
    fetchPublicContent<FAQContent[]>("/content/faq"),
  ]);

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "FAQ — MboQara questions on job matching, CVs, pricing and privacy",
            description:
              "Answers about MboQara: how matches are calculated, who submits applications, document editing, offline use, pricing, countries covered and data control.",
            path: "/faq",
            type: "FAQPage",
          }),
          faqSchema(FAQ_ITEMS),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "FAQ", path: "/faq" },
          ]),
        ]}
      />
      <ClientPage
        initialHero={hero}
        initialFaqs={faqs?.length ? faqs : FAQ_ITEMS}
      />
    </>
  );
}
