import ClientPage from "./client-page";
import { metadata } from "./page-metadata";
import { fetchPublicContent } from "@/lib/server-content";
import {
  JsonLd,
  breadcrumbSchema,
  mobileApplicationSchema,
  webPageSchema,
} from "@/components/seo/json-ld";

export { metadata };
export const revalidate = 300;

interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

interface FeatureContent {
  id: string;
  title: string;
  body: string;
  icon: string;
}

export default async function Page() {
  const [hero, features] = await Promise.all([
    fetchPublicContent<HeroContent>("/content/download/hero"),
    fetchPublicContent<FeatureContent[]>("/content/download/features"),
  ]);

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "Download the MboQara Android app",
            description:
              "Get the MboQara job search app on Google Play: browse roles, save favourites, track applications and keep documents at hand, even offline.",
            path: "/download",
          }),
          mobileApplicationSchema(),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Download", path: "/download" },
          ]),
        ]}
      />
      <ClientPage initialHero={hero} initialFeatures={features} />
    </>
  );
}
