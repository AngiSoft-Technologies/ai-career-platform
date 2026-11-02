import { HOME_KEYWORDS, SITE, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: `Find work that fits you | MboQara — AI job search, tailored CVs and application tracking`,
  description:
    "Find live jobs and employment opportunities worldwide, see how each one fits your skills and experience, tailor your CV, resume and cover letter, and track every application — reviewed and submitted by you.",
  path: "/",
  keywords: HOME_KEYWORDS,
  image: SITE.ogImage,
  type: "website",
});
