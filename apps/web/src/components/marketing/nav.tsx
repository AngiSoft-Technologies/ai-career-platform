"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Menu,
  X,
  Briefcase,
  Sparkles,
  Globe,
  HelpCircle,
  Info,
} from "lucide-react";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV_LINKS = [
  { href: "/features", label: "Features", icon: Sparkles },
  { href: "/pricing", label: "Pricing", icon: Briefcase },
  { href: "/about", label: "About", icon: Info },
  { href: "/contact", label: "Contact", icon: Globe },
  { href: "/faq", label: "FAQ", icon: HelpCircle },
];

export function MarketingNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header className={clsx("mk-nav", scrolled && "mk-nav--scrolled")} role="banner">
        <div className="mk-nav__inner">
          <Link href="/" className="mk-nav__logo" aria-label="Job Radar — Home">
            <img src="/brand/logo-wordmark-light.png" alt="" width={128} height={36} loading="eager" />
          </Link>

          <nav className="mk-nav__primary" role="navigation" aria-label="Main navigation">
            <ul className="mk-nav__list">
              {NAV_LINKS.map((item) => (
                <li key={item.href} className="mk-nav__item">
                  <Link
                    href={item.href}
                    className={clsx("mk-nav__link", pathname === item.href && "is-active")}
                    aria-current={pathname === item.href ? "page" : undefined}
                  >
                    <item.icon className="mk-nav__icon" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mk-nav__actions">
            <Link href="/login" className="mk-btn mk-btn--ghost">
              Sign in
            </Link>
            <Link href="/signup" className="mk-btn mk-btn--primary">
              Start free
            </Link>

            <button
              className="mk-nav__mobile-toggle"
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="mk-nav__mobile-icon" aria-hidden="true" /> : <Menu className="mk-nav__mobile-icon" aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div id="mobile-menu" className={clsx("mk-mobile-menu", mobileOpen && "is-open")} role="dialog" aria-label="Navigation menu" aria-modal="true">
          <nav className="mk-mobile-menu__inner">
            <ul className="mk-mobile-menu__list">
              {NAV_LINKS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={clsx("mk-mobile-menu__link", pathname === item.href && "is-active")}
                    onClick={() => setMobileOpen(false)}
                    aria-current={pathname === item.href ? "page" : undefined}
                  >
                    <item.icon className="mk-mobile-menu__icon" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mk-mobile-menu__actions">
              <Link href="/login" className="mk-btn mk-btn--ghost mk-btn--full" onClick={() => setMobileOpen(false)}>
                Sign in
              </Link>
              <Link href="/signup" className="mk-btn mk-btn--primary mk-btn--full" onClick={() => setMobileOpen(false)}>
                Start free
              </Link>
            </div>
          </nav>
        </div>
      </header>
    </>
  );
}