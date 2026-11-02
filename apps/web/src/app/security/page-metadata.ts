import { SECURITY_KEYWORDS, pageMetadata } from "@/lib/seo";

const OGG = {
  url: "/media/og-cover.jpg",
  width: 1200,
  height: 630,
  alt: "MboQara security — encrypted access, private documents",
};

export const metadata = pageMetadata({
  title: "Privacy and security — your profile, CVs and documents stay private",
  description:
    "MboQara keeps your profile, CVs and application documents private. Encrypted access, time-limited document links, no data selling, no third-party AI training. Built for Kenya and worldwide.",
  path: "/security",
  image: OGG,
  keywords: [
    "MboQara security",
    "job app privacy",
    "is my CV safe online",
    "data privacy job search",
    "no CV selling",
    "Kenya Data Protection Act",
    "GDPR job search",
    "secure document storage",
  ],
});
