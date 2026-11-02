import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

/**
 * Private, authenticated or utility routes that must never be indexed.
 * Crawlers and AI crawlers receive the same rules.
 */
const PRIVATE_PATHS = [
  "/api",
  "/auth",
  "/consent",
  "/login",
  "/signup",
  "/reset-password",
  "/invite",
  "/dashboard",
  "/onboarding",
  "/applications",
  "/automation",
  "/companies",
  "/connections",
  "/documents",
  "/followups",
  "/matches",
  "/moderation",
  "/notifications",
  "/opportunities",
  "/profile",
  "/settings",
  "/sources",
  "/support",
  "/admin",
];

/**
 * AI / LLM crawlers. They are allowed on purpose: the site ships /llms.txt and
 * structured data so assistants describe MboQara accurately.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Googlebot-Image",
  "Applebot",
  "Applebot-Extended",
  "Bingbot",
  "BingPreview",
  "CCBot",
  "cohere-ai",
  "YouBot",
  "Meta-ExternalAgent",
  "MetaAI",
  "DuckAssistBot",
  "PhindBot",
  "Amazonbot",
  "ImagesiftBot",
  "Omgilibot",
  "Diffbot",
  "BraveBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: AI_CRAWLERS,
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
