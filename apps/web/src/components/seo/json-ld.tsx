import { SITE } from "@/lib/seo";

type Json = Record<string, unknown>;

/**
 * Renders schema.org JSON-LD. Kept as a server component so the markup is in
 * the initial HTML (important for crawlers and generative engines that do not
 * execute JavaScript).
 */
export function JsonLd({ data }: { data: Json | Json[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      // JSON-LD is static, server-rendered data.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

export const ORGANIZATION_ID = `${SITE.url}/#organization`;
export const WEBSITE_ID = `${SITE.url}/#website`;
export const APP_ID = `${SITE.url}/#app`;

export function organizationSchema(): Json {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE.name,
    legalName: SITE.legalName,
    alternateName: SITE.alternateNames,
    url: SITE.url,
    logo: {
      "@type": "ImageObject",
      url: `${SITE.url}/brand/logo-mark.png`,
      caption: `${SITE.name} logo`,
    },
    image: `${SITE.url}${SITE.ogImage.url}`,
    description: SITE.longDescription,
    email: SITE.email,
    address: {
      "@type": "PostalAddress",
      addressLocality: SITE.city,
      addressCountry: "KE",
    },
    areaServed: [
      { "@type": "Country", name: SITE.country },
      { "@type": "Place", name: "Africa" },
      "Worldwide",
    ],
    knowsLanguage: ["en", "sw"],
    foundingDate: String(SITE.foundingYear),
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: SITE.supportEmail,
        availableLanguage: ["English", "Swahili"],
        areaServed: "Worldwide",
      },
    ],
    sameAs: [
      "https://www.linkedin.com/company/angisoft-technologies",
      "https://github.com/AngiSoft-Technologies",
      "https://x.com/angisofttech",
      "https://www.facebook.com/angisofttechnologies",
      "https://www.instagram.com/angisofttech",
      "https://youtube.com/@angisofttechnologies",
    ],
  };
}

export function websiteSchema(): Json {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE.name,
    alternateName: SITE.alternateNames,
    url: SITE.url,
    description: SITE.shortDescription,
    inLanguage: [SITE.language, "en", "sw"],
    publisher: { "@id": ORGANIZATION_ID },
    about: { "@id": APP_ID },
  };
}

export function softwareApplicationSchema(): Json {
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: SITE.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Job search and career management",
    operatingSystem: "Android, Web",
    url: SITE.url,
    description: SITE.longDescription,
    inLanguage: [SITE.language, "en"],
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "KES",
      description: "Free founding access during beta; no credit card required.",
      availability: "https://schema.org/InStock",
    },
    featureList: [
      "Global job discovery across job boards and company career pages",
      "Profile-based match scoring for skills, experience, location and work mode",
      "AI-assisted CV and cover-letter drafting with human review",
      "Application tracker with stages, documents and follow-up reminders",
      "Offline-capable Android app that syncs when the connection returns",
      "Private documents with time-limited access links",
    ],
    publisher: { "@id": ORGANIZATION_ID },
    provider: { "@id": ORGANIZATION_ID },
    areaServed: [
      { "@type": "Country", name: SITE.country },
      { "@type": "Place", name: "Africa" },
      "Worldwide",
    ],
  };
}

export function mobileApplicationSchema(): Json {
  return {
    "@type": "MobileApplication",
    name: `${SITE.name} for Android`,
    operatingSystem: "Android 8.0+",
    applicationCategory: "BusinessApplication",
    url: `${SITE.url}/download`,
    downloadUrl:
      "https://play.google.com/store/apps/details?id=ke.co.angisoft.mboqara",
    installUrl:
      "https://play.google.com/store/apps/details?id=ke.co.angisoft.mboqara",
    offers: { "@type": "Offer", price: "0", priceCurrency: "KES" },
    publisher: { "@id": ORGANIZATION_ID },
    description:
      "The MboQara Android app: browse and save roles, review your applications and keep documents at hand, with offline support.",
  };
}

export function webPageSchema({
  name,
  description,
  path,
  type = "WebPage",
}: {
  name: string;
  description: string;
  path: string;
  type?: "WebPage" | "AboutPage" | "ContactPage" | "FAQPage" | "CollectionPage";
}): Json {
  return {
    "@type": type,
    "@id": `${SITE.url}${path}#webpage`,
    url: `${SITE.url}${path}`,
    name,
    description,
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": APP_ID },
    inLanguage: SITE.language,
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: `${SITE.url}${SITE.ogImage.url}`,
      width: SITE.ogImage.width,
      height: SITE.ogImage.height,
    },
  };
}

export function breadcrumbSchema(
  items: Array<{ name: string; path: string }>,
): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE.url}${item.path}`,
    })),
  };
}

const EMPLOYMENT_TYPES: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  temporary: "TEMPORARY",
  intern: "INTERN",
  internship: "INTERN",
  volunteer: "VOLUNTEER",
  per_diem: "PER_DIEM",
  other: "OTHER",
};

/**
 * JobPosting for the public, indexable role page.
 *
 * `descriptionHtml` is built from the same visible text as the page body and
 * only from the public payload — never from a login-gated API response. The
 * Apply URL is intentionally not exposed: `directApply` stays unset because
 * the application desk is the next step, not an employer offsite link.
 */
export function jobPostingSchema({
  opportunity,
  descriptionHtml,
  path,
}: {
  opportunity: {
    id: string;
    title: string;
    company: string;
    country: string;
    city: string;
    workMode: string;
    seniority: string;
    employmentType: string;
    salaryMin?: number;
    salaryMax?: number;
    currency?: string;
    postedAt: string;
    expiresAt?: string;
  };
  descriptionHtml: string;
  path: string;
}): Json {
  const remote = /(remote|telecommute|virtual|anywhere)/i.test(
    `${opportunity.workMode} ${opportunity.city}`,
  );
  const hasSalary = Boolean(opportunity.salaryMin || opportunity.salaryMax);
  const employmentType =
    EMPLOYMENT_TYPES[opportunity.employmentType] ?? "OTHER";

  return {
    "@type": "JobPosting",
    "@id": `${SITE.url}${path}#jobposting`,
    url: `${SITE.url}${path}`,
    title: opportunity.title,
    description: descriptionHtml,
    datePosted: opportunity.postedAt,
    ...(opportunity.expiresAt ? { validThrough: opportunity.expiresAt } : {}),
    employmentType,
    hiringOrganization: {
      "@type": "Organization",
      name: opportunity.company,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        ...(opportunity.city ? { addressLocality: opportunity.city } : {}),
        addressCountry: opportunity.country || SITE.country,
      },
    },
    ...(remote
      ? {
          jobLocationType: "TELECOMMUTE",
          applicantLocationRequirements: {
            "@type": "Country",
            name: opportunity.country || SITE.country,
          },
        }
      : {}),
    ...(hasSalary
      ? {
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: opportunity.currency || "KES",
            value: {
              "@type": "QuantitativeValue",
              ...(opportunity.salaryMin
                ? { minValue: opportunity.salaryMin }
                : {}),
              ...(opportunity.salaryMax
                ? { maxValue: opportunity.salaryMax }
                : {}),
              unitText: "YEAR",
            },
          },
        }
      : {}),
    identifier: {
      "@type": "PropertyValue",
      name: `${SITE.name} opportunity ID`,
      value: opportunity.id,
    },
  };
}

export function faqSchema(items: Array<{ question: string; answer: string }>): Json {
  return {
    "@type": "FAQPage",
    "@id": `${SITE.url}/faq#faq`,
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function itemListSchema({
  name,
  items,
}: {
  name: string;
  items: Array<{ name: string; description: string; url?: string }>;
}): Json {
  return {
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      description: item.description,
      ...(item.url ? { url: `${SITE.url}${item.url}` } : {}),
    })),
  };
}

export function howToSchema({
  name,
  description,
  steps,
}: {
  name: string;
  description: string;
  steps: Array<{ name: string; text: string }>;
}): Json {
  return {
    "@type": "HowTo",
    name,
    description,
    totalTime: "PT20M",
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}
