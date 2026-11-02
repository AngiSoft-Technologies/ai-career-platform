import ClientPage from "./client-page";
import { metadata } from "./page-metadata";
import { fetchPublicContent } from "@/lib/server-content";

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

/** Server-rendered so crawlers and AI assistants see the real feature copy. */
export default async function Page() {
  const [hero, features] = await Promise.all([
    fetchPublicContent<HeroContent>("/content/features/hero"),
    fetchPublicContent<FeatureContent[]>("/content/features"),
  ]);

  return <ClientPage initialHero={hero} initialFeatures={features} />;
}
