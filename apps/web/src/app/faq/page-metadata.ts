import { FAQ_KEYWORDS, pageMetadata } from "@/lib/seo";

const OGG = {
  url: "/media/og-cover.jpg",
  width: 1200,
  height: 630,
  alt: "MboQara FAQ — questions about job discovery, documents and tracking",
};

export const metadata = pageMetadata({
  title: "FAQ — MboQara questions on job matching, CVs, pricing and privacy",
  description:
    "Answers about MboQara: how matches are calculated, who submits applications, document editing, offline use, pricing, countries covered and data control.",
  path: "/faq",
  image: OGG,
  keywords: [
    "MboQara FAQ",
    "how MboQara works",
    "is MboQara free",
    "which countries MboQara covers",
    "does MboQara apply for me",
    "MboQara data privacy",
  ],
});
