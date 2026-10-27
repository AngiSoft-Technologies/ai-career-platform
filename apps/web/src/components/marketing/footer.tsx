import Link from "next/link";
import {
  Sparkles,
  FileText,
  Briefcase,
  ShieldCheck,
  Globe,
  HelpCircle,
  Lock,
  Info,
  Download,
  Mail,
  MapPin,
  ArrowRight,
  Linkedin,
  Github,
  X,
} from "lucide-react";

const FOOTER_LINKS = {
  Product: [
    { href: "/features", label: "Features", icon: Sparkles },
    { href: "/pricing", label: "Pricing", icon: Briefcase },
    { href: "/download", label: "Download", icon: Download },
    { href: "/features#security", label: "Scam Shield", icon: ShieldCheck },
  ],
  Company: [
    { href: "/about", label: "About", icon: Info },
    { href: "/contact", label: "Contact", icon: Globe },
  ],
  Resources: [
    { href: "/faq", label: "FAQ", icon: HelpCircle },
    { href: "/security", label: "Security", icon: Lock },
    { href: "https://www.angisoft.co.ke", label: "AngiSoft Technologies", icon: ArrowRight, external: true },
  ],
  Legal: [
    { href: "/privacy", label: "Privacy", icon: Lock },
    { href: "/terms", label: "Terms", icon: FileText },
  ],
};

const SOCIAL_LINKS = [
  { href: "https://www.linkedin.com/company/angisoft-technologies", label: "LinkedIn", icon: Linkedin, external: true },
  { href: "https://github.com/AngiSoft-Technologies", label: "GitHub", icon: Github, external: true },
  { href: "https://x.com/AngiSoftTech", label: "X", icon: X, external: true },
];

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mk-footer" role="contentinfo">
      <div className="mk-footer__grid">
        <div className="mk-footer__brand">
          <Link href="/" className="mk-footer__logo" aria-label="Job Radar — Home">
            <img src="/brand/logo-wordmark-light.png" alt="" width={148} height={41} />
          </Link>
          <p className="mk-footer__tagline">
            AI prepares. You decide. You submit.
          </p>
          <address className="mk-footer__address">
            <MapPin className="mk-footer__address-icon" aria-hidden="true" />
            <span>AngiSoft Technologies, Nairobi, Kenya</span>
          </address>
          <div className="mk-footer__social" role="list" aria-label="Social links">
            {SOCIAL_LINKS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                className="mk-footer__social-link"
                target={s.external ? "_blank" : undefined}
                rel={s.external ? "noopener noreferrer" : undefined}
                aria-label={s.label}
              >
                <s.icon className="mk-footer__social-icon" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>

        <nav className="mk-footer__nav" aria-label="Footer navigation">
          {Object.entries(FOOTER_LINKS).map(([section, links]) => (
            <div key={section} className="mk-footer__section">
              <h4 className="mk-footer__section-title">{section}</h4>
              <ul className="mk-footer__list">
                {links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="mk-footer__link"
                      target={l.href.startsWith("http") ? "_blank" : undefined}
                      rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    >
                      <l.icon className="mk-footer__link-icon" aria-hidden="true" />
                      <span>{l.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="mk-footer__bottom">
        <p className="mk-footer__copyright">
          &copy; {year} Job Radar by AngiSoft Technologies. All rights reserved.
        </p>
        <p className="mk-footer__motto">
          Global roles, scam screening, ATS-ready documents.
        </p>
      </div>
    </footer>
  );
}