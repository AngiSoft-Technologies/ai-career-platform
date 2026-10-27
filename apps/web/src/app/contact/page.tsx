import { Metadata } from "next";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { ContactForm } from "@/components/marketing/contact-form";
import { Mail, MapPin, Clock, Globe, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact — Job Radar",
  description: "Get in touch with the Job Radar team. We're based in Nairobi, Kenya. Free during founding access.",
  openGraph: {
    title: "Contact — Job Radar",
    description: "Get in touch with the Job Radar team. Nairobi, Kenya.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};

export default function ContactPage() {
  return (
    <MarketingLayout>
      <section className="mk-section" style={{ paddingTop: "140px" }} aria-labelledby="contact-title">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Contact</span>
            <h1 id="contact-title" className="mk-heading">Let's talk</h1>
            <p className="mk-lede">Questions, feedback, or just want to say hello — we'd love to hear from you.</p>
          </header>
          <div className="mk-grid mk-grid--2" style={{ gap: "48px", alignItems: "start" }}>
            <Reveal delay={0}>
              <div className="mk-card" style={{ height: "100%" }}>
                <h3 className="mk-card__title" style={{ marginBottom: "24px" }}>Get in touch</h3>
                <ContactForm />
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="mk-card" style={{ height: "100%" }}>
                <h3 className="mk-card__title" style={{ marginBottom: "24px" }}>Other ways to reach us</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <a href="mailto:hello@angisoft.co.ke" className="mk-contact-link">
                    <Mail className="mk-contact-link__icon" aria-hidden="true" />
                    <div>
                      <div className="mk-contact-link__label">Email</div>
                      <div className="mk-contact-link__value">hello@angisoft.co.ke</div>
                    </div>
                  </a>
                  <a href="https://www.angisoft.co.ke" target="_blank" rel="noopener noreferrer" className="mk-contact-link">
                    <Globe className="mk-contact-link__icon" aria-hidden="true" />
                    <div>
                      <div className="mk-contact-link__label">Website</div>
                      <div className="mk-contact-link__value">angisoft.co.ke</div>
                    </div>
                  </a>
                  <div className="mk-contact-link">
                    <MapPin className="mk-contact-link__icon" aria-hidden="true" />
                    <div>
                      <div className="mk-contact-link__label">Office</div>
                      <div className="mk-contact-link__value">AngiSoft Technologies, Nairobi, Kenya</div>
                    </div>
                  </div>
                  <div className="mk-contact-link">
                    <Clock className="mk-contact-link__icon" aria-hidden="true" />
                    <div>
                      <div className="mk-contact-link__label">Hours</div>
                      <div className="mk-contact-link__value">Mon–Fri, 9am–6pm EAT</div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="mk-section mk-cta" aria-labelledby="cta-heading">
        <div className="mk-container">
          <h2 id="cta-heading" className="mk-cta__title">Ready to join the beta?</h2>
          <p className="mk-cta__text">Free during development. No credit card. Help us build the honest job search you deserve.</p>
          <div className="mk-cta__actions">
            <a href="/download" className="mk-btn mk-btn--primary mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Get the Android app
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
