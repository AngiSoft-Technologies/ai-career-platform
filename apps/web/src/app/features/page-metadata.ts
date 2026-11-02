import { FEATURES_KEYWORDS, pageMetadata } from "@/lib/seo";

const OGG = {
  url: "/media/og-cover.jpg",
  width: 1200,
  height: 630,
  alt: "MboQara features — discovery, matching, documents and tracking",
};

export const metadata = pageMetadata({
  title: "Features — job discovery, match scoring, CV and cover letter drafting, application tracking",
  description:
    "See every MboQara feature: worldwide opportunity discovery, profile-based match scoring, AI-assisted CV and cover letter drafting, application tracking and offline mobile access.",
  path: "/features",
  image: OGG,
  keywords: [
    "job app features",
    "job matching features",
    "AI CV generator",
    "AI cover letter generator",
    "application tracker features",
    "job search features",
    "career platform features",
    "offline job app features",
  ],
});
