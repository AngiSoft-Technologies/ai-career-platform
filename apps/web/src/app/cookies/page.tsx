import Link from "next/link";
import { MarketingLayout } from "@/components/marketing/layout";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, breadcrumbSchema, webPageSchema } from "@/components/seo/json-ld";
import { Cookie } from "lucide-react";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Cookie notice — what MboQara stores in your browser",
  description:
    "What cookies and local storage MboQara sets, why each one exists, and how to clear them. No advertising cookies, no cross-site trackers — and no YouTube cookies until you press play.",
  path: "/cookies",
  keywords: ["cookie policy", "MboQara cookies", "local storage", "privacy"],
});

interface LegalSection {
  id: string;
  title: string;
  body: string;
}

const SECTIONS: LegalSection[] = [
  {
    id: "what-this-covers",
    title: "What this notice covers",
    body: "This page covers everything the MboQara website and web app store in your browser: HTTP cookies, Local Storage entries, and the service-worker cache. It is deliberately specific — a cookie notice that says “we use cookies to improve your experience” tells you nothing you can act on. Read alongside the privacy policy, which covers what is stored on our servers.",
  },
  {
    id: "essential",
    title: "What keeps you signed in",
    body: "When you sign in, a first-party session cookie is set on the mboqara.angisoft.co.ke origin by our authentication provider, and relayed by the API so it stays first-party rather than being set by another domain. It exists so you do not have to sign in on every page. Signing out clears it. This is the only cookie the site sets by default.",
  },
  {
    id: "local-storage",
    title: "What is kept in Local Storage",
    body: "Three things, all first-party and all tied to your device: your theme preference; a cache of the API responses the app has already fetched, so pages open when the connection does not; and a queue of actions you took while offline, so they sync when you reconnect. The mobile app keeps the same data on the device instead. Signing out removes these entries.",
  },
  {
    id: "videos",
    title: "Videos, and when third parties appear",
    body: "The videos on this site are behind a play button for exactly this reason: pressing play asks YouTube for the player, and only then does YouTube set its own cookies on your device. Until you press play, nothing is requested from any video provider. No other third-party script, pixel or tag is loaded by this site.",
  },
  {
    id: "what-we-dont",
    title: "What is not here",
    body: "No advertising cookies. No cross-site trackers. No social pixels. No analytics that follow you to other sites. The figures on our pages are counted from our own database, not measured from your browser.",
  },
  {
    id: "controls",
    title: "Your controls",
    body: "Your browser can show and delete everything listed here: the site's cookies, its Local Storage entries, and its service-worker cache. Clearing site data signs you out and resets your theme, and nothing else. Blocking cookies entirely will keep you signed out — sign-in is the one thing that genuinely needs them.",
  },
  {
    id: "contact",
    title: "Questions",
    body: "If anything stored by this site surprises you, tell us and we will explain it or remove it. The contact page reaches the team, and privacy requests can be sent to the same address.",
  },
];

export default function CookiesPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "Cookie notice — MboQara",
            description:
              "What the MboQara site stores in your browser: one first-party session cookie, local storage for theme and offline cache, service-worker cache, and no advertising trackers.",
            path: "/cookies",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Cookie notice", path: "/cookies" },
          ]),
        ]}
      />
      <MarketingLayout>
        <section className="mk-section mk-legal" aria-labelledby="cookies-title">
          <div className="mk-container mk-grid mk-grid--2" style={{ gap: "48px", alignItems: "start" }}>
            <aside className="mk-legal__toc">
              <nav className="mk-legal__toc-inner">
                <h3 className="mk-legal__toc-title">
                  <Cookie size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />
                  On this page
                </h3>
                <ul className="mk-legal__toc-list">
                  {SECTIONS.map((section) => (
                    <li key={section.id}>
                      <a className="mk-legal__toc-link" href={`#${section.id}`}>
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            <article className="mk-legal__content">
              <span className="mk-eyebrow mk-eyebrow--signal" style={{ marginBottom: "14px" }}>
                <span className="mk-eyebrow__rule" aria-hidden="true" />
                Cookie notice
              </span>
              <h1 id="cookies-title" className="mk-legal__section-title">
                What this site stores in your browser
              </h1>
              <p className="mk-legal__text">
                One session cookie, a little local storage, and nothing that follows you anywhere else. The whole
                list is below — if it is not on the list, this site does not set it.
              </p>

              {SECTIONS.map((section) => (
                <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
                  <h2 className="mk-legal__section-title" id={`${section.id}-title`}>
                    {section.title}
                  </h2>
                  <p className="mk-legal__text">{section.body}</p>
                </section>
              ))}

              <div className="mk-panel" style={{ marginTop: "28px", padding: "20px 22px", display: "grid", gap: "10px" }}>
                <h2 className="mk-legal__section-title" style={{ fontSize: "1.05rem" }}>
                  The list, in one place
                </h2>
                <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "grid", gap: "8px", color: "var(--mk-text-soft)", fontSize: "0.92rem", lineHeight: 1.6 }}>
                  <li>
                    <strong style={{ color: "var(--mk-text)" }}>Session cookie</strong> — first-party, keeps you
                    signed in, cleared when you sign out.
                  </li>
                  <li>
                    <strong style={{ color: "var(--mk-text)" }}>Local Storage: theme</strong> — your light or dark
                    preference on this device.
                  </li>
                  <li>
                    <strong style={{ color: "var(--mk-text)" }}>Local Storage: cache and outbox</strong> — pages
                    you have already opened, and actions taken offline, until they sync.
                  </li>
                  <li>
                    <strong style={{ color: "var(--mk-text)" }}>Service-worker cache</strong> — the app shell, so
                    the site opens without a connection.
                  </li>
                  <li>
                    <strong style={{ color: "var(--mk-text)" }}>YouTube cookies</strong> — only after you press play
                    on a video, and set by YouTube under its own policy.
                  </li>
                </ul>
              </div>

              <p className="mk-legal__text" style={{ marginTop: "24px" }}>
                Related reading: the{" "}
                <Link className="mk-link" href="/privacy">
                  privacy policy
                </Link>{" "}
                covers what we store on our servers, and the{" "}
                <Link className="mk-link" href="/contact">
                  contact page
                </Link>{" "}
                reaches the team.
              </p>
            </article>
          </div>
        </section>
      </MarketingLayout>
    </>
  );
}
