import { Router } from "express";

export const contentRouter = Router();

type Hero = { id: string; title: string; subtitle: string; description: string };
type Feature = { id: string; title: string; body: string; icon: string };
type Section = { id: string; title: string; body: string };

const hero = (id: string, title: string, subtitle: string, description: string): Hero => ({
  id,
  title,
  subtitle,
  description,
});

const benefits: Feature[] = [
  { id: "discover", title: "Find relevant opportunities", body: "Explore openings from multiple sources and filter by role, location, work mode and experience.", icon: "Search" },
  { id: "match", title: "Understand your fit", body: "See how your skills, experience and preferences align with a role.", icon: "Target" },
  { id: "prepare", title: "Prepare your documents", body: "Generate role-focused resumes and cover letters, then review and edit them.", icon: "FileText" },
  { id: "track", title: "Keep applications moving", body: "Track application stages, organise documents and schedule follow-up reminders.", icon: "Briefcase" },
];

const featureSet: Feature[] = [
  { id: "discovery", title: "Opportunity discovery", body: "Search active roles from job boards and company career pages, all in one place.", icon: "Search" },
  { id: "matching", title: "Profile-based matching", body: "Compare role requirements with your skills, experience, work mode and location preferences.", icon: "Target" },
  { id: "documents", title: "Application documents", body: "Generate, edit, validate and export role-focused application documents.", icon: "FileText" },
  { id: "workspace", title: "Application workspace", body: "Keep role details, preparation notes, documents and reminders connected to an application.", icon: "Briefcase" },
];

const faq = [
  { id: "what-is-job-radar", question: "What does Job Radar do?", answer: "Job Radar helps you discover job opportunities, understand how they fit your profile, prepare application documents and track your application steps." },
  { id: "how-matching-works", question: "How are matches calculated?", answer: "We compare your skills, experience, preferences and location with each role, and give newer roles extra attention. Results are guidance to help you review a role, not a hiring guarantee." },
  { id: "does-it-apply", question: "Does Job Radar submit applications for me?", answer: "No. Job Radar helps you prepare and organise your application. You review your materials and submit through the employer’s application channel." },
  { id: "documents", question: "Can I edit generated documents?", answer: "Yes. Generated documents can be reviewed and edited before you export or use them." },
  { id: "mobile-offline", question: "Can I use the mobile app offline?", answer: "Yes. The app keeps your roles and application details available offline, and sends your changes across when your connection returns." },
  { id: "data-control", question: "Who controls my application decisions?", answer: "You do. Job Radar provides information and preparation tools; you choose which roles to pursue and when to share or submit documents." },
];

const legalPrivacy: Section[] = [
  { id: "data-handled", title: "Information the app handles", body: "The service stores account identifiers and the candidate profile, preferences, saved opportunities, application activity, reminders and documents needed to provide its features." },
  { id: "feature-use", title: "How information is used", body: "Profile and preference information is used to filter and rank opportunities. Application and document records are used to provide the workspace, document generation and tracking features." },
  { id: "ai-assistance", title: "AI-assisted features", body: "Some features use AI to help draft summaries and documents. When you use them, the information you provide is used to produce the result. Review generated content before relying on it." },
  { id: "service-providers", title: "Service providers", body: "We use trusted service providers to host Job Radar, store your uploads and keep your account secure. They process your information only to deliver those services." },
  { id: "choices", title: "Your choices", body: "Keep your profile and application details current, avoid adding information you do not want processed, and contact AngiSoft to ask about account or data requests." },
];

const legalTerms: Section[] = [
  { id: "service", title: "Using the service", body: "Job Radar provides opportunity discovery, profile-based matching, document preparation and application tracking tools. Use the service lawfully and keep your account credentials secure." },
  { id: "third-party-listings", title: "Third-party job listings", body: "Listings are gathered from external sources. Availability, accuracy, deadlines and application requirements can change; verify details with the employer before applying." },
  { id: "ai-content", title: "Generated content", body: "AI-assisted summaries, match explanations and documents can contain errors or omit context. Review and correct generated material before using it." },
  { id: "application-submission", title: "Your application decisions", body: "You choose whether to apply and submit materials through the employer’s channel. Job Radar does not guarantee interviews, offers or employment outcomes." },
  { id: "beta", title: "Beta service", body: "Features and availability may change while Job Radar is in beta. Check the pricing page for the latest offer." },
];

const content: Record<string, unknown> = {
  benefits,
  comparison: {
    columns: [
      { id: "search", label: "One focused search", items: ["Explore roles from supported sources", "Filter by your goals"], check: true },
      { id: "prepare", label: "A clearer application", items: ["Review profile-based fit", "Prepare role-focused documents"], check: true },
      { id: "control", label: "Your choice at every step", items: ["Edit before sharing", "Submit through the employer"], check: true },
    ],
  },
  "about/hero": hero("about-hero", "Career progress, built around you", "Built for job seekers", "Find opportunities, prepare thoughtfully and keep your application steps in one workspace."),
  "about/benefits": benefits,
  "about/comparison": [
    { id: "control", label: "You stay in control", items: ["Review your profile and documents", "Choose where and when you apply"], check: true },
    { id: "clarity", label: "Move with clarity", items: ["See why a role may fit", "Keep next steps in view"], check: true },
    { id: "focus", label: "Built around your goals", items: ["Keep preferences close", "Organise the search in one place"], check: true },
  ],
  "features/hero": hero("features-hero", "Find real jobs. Apply with confidence.", "Product features", "Discover opportunities, review your fit, prepare application documents and track your progress."),
  features: featureSet,
  "faq/hero": hero("faq-hero", "Questions? We have answers", "Frequently asked questions", "Learn how Job Radar supports opportunity discovery, document preparation and application tracking."),
  faq,
  "pricing/hero": hero("pricing-hero", "Free during beta. No credit card.", "Pricing", "Founding access is free during beta. We will publish updated pricing before any paid plans launch."),
  "pricing/plans": [{
    id: "beta-access", name: "Founding access", badge: "Free during beta", price: 0, period: "during beta",
    description: "Use the current Job Radar features while we build and improve the service.",
    features: [
      { id: "discovery", label: "Opportunity search and matching", included: true },
      { id: "tracking", label: "Application and follow-up tracking", included: true },
      { id: "documents", label: "Document preparation and export", included: true },
    ],
    ctaLabel: "Create a profile", ctaHref: "/signup",
  }],
  "stories/hero": hero("stories-hero", "Different paths. One place to keep moving.", "Career stories", "Job Radar supports the real work behind a job search: finding an opening, preparing your materials and following through."),
  stories: [],
  "security/hero": hero("security-hero", "Your privacy and security", "Security", "We use authenticated access and role checks to protect account features. Review the details below and contact us with security questions."),
  security: [
    { id: "account-access", title: "Account access", body: "You sign in to reach your profile and your applications. Our team only reaches your account information when they need to help you." },
    { id: "transport", title: "Transport and configuration", body: "Your connection is encrypted, and service credentials are kept out of public code." },
    { id: "uploads", title: "Documents and uploads", body: "Your uploads are stored privately and shared through time-limited links. Keep exported copies in a location you control." },
  ],
  "privacy/hero": hero("privacy-hero", "Privacy Policy", "Your information", "This summary describes the data handled by the current Job Radar implementation. Contact us with questions or requests."),
  privacy: legalPrivacy,
  "terms/hero": hero("terms-hero", "Terms of Service", "Using Job Radar", "These terms describe the current beta service and its limitations."),
  terms: legalTerms,
  "download/hero": hero("download-hero", "Your job search, wherever you are", "Job Radar for Android", "Browse roles, track your applications, review your documents and pick up where you left off from your phone."),
  "download/features": [
    { id: "discover", title: "Browse opportunities", body: "Search and filter roles, then save opportunities for later.", icon: "Search" },
    { id: "track", title: "Track your applications", body: "Review application stages and connected follow-up reminders.", icon: "Briefcase" },
    { id: "offline", title: "Work through interruptions", body: "Some profile and application changes can queue locally and sync when you reconnect.", icon: "HardDrive" },
  ],
};

contentRouter.get(/.*/, (request, response) => {
  const key = request.path.replace(/^\/+|\/+$/g, "");
  const value = content[key];
  if (value === undefined) {
    response.status(404).json({ error: "Public content not found", code: "CONTENT_NOT_FOUND" });
    return;
  }
  response.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  response.json(value);
});
