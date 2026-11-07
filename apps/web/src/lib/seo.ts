import type { Metadata } from "next";
import {
  ABOUT_KEYWORDS,
  BRAND_KEYWORDS,
  CAREER_KEYWORDS,
  DOWNLOAD_KEYWORDS,
  DOCUMENTS_KEYWORDS,
  FAQ_KEYWORDS,
  FEATURES_KEYWORDS,
  GEO_KEYWORDS,
  HOME_KEYWORDS,
  JOB_KEYWORDS,
  PRICING_KEYWORDS,
  SECURITY_KEYWORDS,
  uniqueKeywords,
} from "./keywords";

/**
 * Single source of truth for search, social and generative-engine metadata.
 *
 * Brand casing rule: user-facing text is "MboQara"; technical identifiers
 * (domains, package ids) stay lowercase.
 */
export const SITE = {
  name: "MboQara",
  alternateNames: ["MboQara", "Mbo Qara", "mboqara", "MboQara app", "MboQara careers"],
  legalName: "AngiSoft Technologies",
  url: "https://mboqara.angisoft.co.ke",
  apiUrl: "https://mboqara-api-angisoft.fly.dev/v1",
  email: "mboqara@angisoft.co.ke",
  supportEmail: "mboqara@angisoft.co.ke",
  locale: "en_KE",
  language: "en-KE",
  country: "Kenya",
  city: "Nairobi",
  tagline: "The clear path to your next opportunity",
  shortDescription:
    "MboQara is an AI career platform: find jobs and employment opportunities worldwide, see how each one fits your profile, tailor your CV, resume and cover letter, and track every application.",
  longDescription:
    "MboQara is the all-in-one career platform for job seekers in Kenya, Africa and worldwide. It discovers live jobs, employment opportunities, internships, attachments, graduate trainee and remote roles from job boards and company career pages, scores every role against your skills, experience, location and work-mode preferences, drafts role-specific CVs, resumes and cover letters from your own information, and tracks each application through to offer. You review every document and submit every application yourself. The Android app keeps saved roles and application details available offline. An application agent that can apply on your behalf is on the roadmap.",
  foundingYear: 2024,
  ogImage: {
    url: "/media/og-cover.jpg",
    width: 1200,
    height: 630,
    alt: "MboQara — AI career platform for job search, tailored CVs and application tracking",
  },
  playStoreUrl:
    "https://play.google.com/store/apps/details?id=ke.co.angisoft.mboqara",
} as const;

/** Keyword sets, re-exported for convenience. */
export {
  ABOUT_KEYWORDS,
  BRAND_KEYWORDS,
  CAREER_KEYWORDS,
  DOWNLOAD_KEYWORDS,
  DOCUMENTS_KEYWORDS,
  FAQ_KEYWORDS,
  FEATURES_KEYWORDS,
  GEO_KEYWORDS,
  HOME_KEYWORDS,
  JOB_KEYWORDS,
  PRICING_KEYWORDS,
  SECURITY_KEYWORDS,
};

/** Root keyword set: brand + job + geo + career families. */
export const BASE_KEYWORDS: string[] = uniqueKeywords([
  BRAND_KEYWORDS,
  JOB_KEYWORDS,
  GEO_KEYWORDS,
  CAREER_KEYWORDS,
]);

export interface PageSeo {
  title: string;
  description: string;
  /** Path beginning with "/" (e.g. "/features"). */
  path: string;
  keywords?: readonly string[];
  image?: { url: string; width: number; height: number; alt: string };
  noindex?: boolean;
  type?: "website" | "article" | "profile";
}

function dedupe(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * Builds a complete Metadata object: canonical URL, hreflang, Open Graph,
 * Twitter card, robots directives and a broad keyword set.
 */
export function pageMetadata({
  title,
  description,
  path,
  keywords = [],
  image = SITE.ogImage,
  noindex = false,
  type = "website",
}: PageSeo): Metadata {
  const url = `${SITE.url}${path}`;
  const images = [image];

  return {
    title,
    description,
    keywords: dedupe([...BASE_KEYWORDS, ...keywords]),
    alternates: {
      canonical: path,
      languages: {
        "en-KE": path,
        en: path,
        "x-default": path,
      },
      types: {
        "text/plain": "/llms.txt",
      },
    },
    openGraph: {
      type,
      url,
      siteName: SITE.name,
      title,
      description,
      locale: SITE.locale,
      alternateLocale: ["en_US", "en_GB", "sw_KE"],
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.map((item) => item.url),
    },
    robots: noindex
      ? { index: false, follow: false, nocache: true }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
  };
}
