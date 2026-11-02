import { DOWNLOAD_KEYWORDS, SITE, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Download MboQara — job search, CV and application tracker app for Android",
  description:
    "Download MboQara on Google Play: search and save jobs worldwide, track applications and reminders, keep your CVs and cover letters at hand, and work offline. Free during beta.",
  path: "/download",
  keywords: DOWNLOAD_KEYWORDS,
  image: {
    url: "/media/bg-download.jpg",
    width: 1200,
    height: 630,
    alt: "MboQara Android app preview — job search, documents and application tracking",
  },
});

export const PLAY_STORE_URL = SITE.playStoreUrl;
