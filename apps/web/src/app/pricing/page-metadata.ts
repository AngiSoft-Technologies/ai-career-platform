import { PRICING_KEYWORDS, pageMetadata } from "@/lib/seo";

const OGG = {
  url: "/media/og-cover.jpg",
  width: 1200,
  height: 630,
  alt: "MboQara pricing — free founding access during beta",
};

export const metadata = pageMetadata({
  title: "Pricing — free founding access during beta, no credit card",
  description:
    "MboQara is free during beta. Founding members get every feature — job search, matching, CV and cover letter drafting, application tracking — free for life, with no credit card.",
  path: "/pricing",
  image: OGG,
  keywords: [
    "MboQara pricing",
    "free job search app",
    "free CV builder",
    "free resume builder",
    "free AI job app",
    "free career platform",
    "is MboQara free",
    "job app without credit card",
    "founding access",
  ],
  type: "website",
});
