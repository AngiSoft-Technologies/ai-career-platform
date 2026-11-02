import type { Metadata, Viewport } from "next";
import { Archivo_Black, Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme";
import { ToastProvider } from "@/components/ui";
import { SessionProvider } from "@/components/session";
import { ServiceWorkerRegistrar } from "@/components/service-worker";
import { JsonLd, organizationSchema, softwareApplicationSchema, websiteSchema } from "@/components/seo/json-ld";
import { BASE_KEYWORDS, SITE, pageMetadata } from "@/lib/seo";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans-brand",
  display: "swap",
  preload: false,
});

const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif-brand",
  display: "swap",
  preload: false,
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-brand",
  display: "swap",
  preload: false,
});

const display = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display-brand",
  display: "swap",
  preload: false,
});

const themeBoot = `(function(){try{var t=localStorage.getItem("mboqara.theme");if(t&&/^[a-z]+$/.test(t)){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

/** Root metadata: canonical site-wide defaults inherited by every route. */
export const metadata: Metadata = {
  ...pageMetadata({
    title: `MboQara — ${SITE.tagline} | AI career platform for jobs, CVs and application tracking`,
    description:
      "MboQara is an AI career platform for job seekers in Kenya, Africa and worldwide: find live roles worldwide, see how each one fits your profile, tailor your CV and cover letter, and track every application in one workspace.",
    path: "/",
    keywords: [...BASE_KEYWORDS],
  }),
  title: {
    default: `MboQara — ${SITE.tagline}`,
    template: "%s | MboQara",
  },
  applicationName: SITE.name,
  publisher: SITE.legalName,
  authors: [{ name: SITE.legalName, url: SITE.url }],
  creator: SITE.legalName,
  category: "jobs, business, productivity, careers",
  classification: "Job Search, Career Development, AI Applications",
  referrer: "strict-origin-when-cross-origin",
  formatDetection: { telephone: false, address: false, email: false },
  alternates: {
    canonical: "/",
    languages: { "en-KE": "/", en: "/", "x-default": "/" },
    types: { "text/plain": "/llms.txt" },
  },
  openGraph: {
    type: "website",
    url: SITE.url,
    siteName: SITE.name,
    title: `MboQara — ${SITE.tagline}`,
    description:
      "Find roles worldwide, see how each one fits your profile, tailor your CV and cover letter, and track every application.",
    locale: SITE.locale,
    alternateLocale: ["en_US", "en_GB", "sw_KE"],
    images: [
      {
        url: SITE.ogImage.url,
        width: SITE.ogImage.width,
        height: SITE.ogImage.height,
        alt: SITE.ogImage.alt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `MboQara — ${SITE.tagline}`,
    description:
      "Find roles worldwide, see how each one fits your profile, tailor your CV and cover letter, and track every application.",
    images: [SITE.ogImage.url],
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/logo-mark.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/brand/logo-mark.png", sizes: "192x192", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SITE.name,
  },
  robots: {
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070b14",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang={SITE.language}
      suppressHydrationWarning
      className={`${sans.variable} ${serif.variable} ${mono.variable} ${display.variable}`}
    >
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <ServiceWorkerRegistrar />
        <ThemeProvider>
          <ToastProvider>
            <SessionProvider>{children}</SessionProvider>
          </ToastProvider>
        </ThemeProvider>
        <JsonLd
          data={[
            organizationSchema(),
            websiteSchema(),
            softwareApplicationSchema(),
          ]}
        />
      </body>
    </html>
  );
}
