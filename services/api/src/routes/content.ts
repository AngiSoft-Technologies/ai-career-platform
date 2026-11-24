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
  { id: "discovery", title: "Discovery that covers the ground", body: "Company career pages and job boards are read every day — 130 employer boards across Kenya and abroad. A role posted on a company's own site is found the same day it appears, without opening nine tabs.", icon: "Search" },
  { id: "eligibility", title: "Eligibility, before you apply", body: "The posting's own requirements decide it: citizenship, residency, years of experience, degree or licence. If a candidate in Kenya cannot hold the role, it says so — you stop wasting an afternoon on it.", icon: "BadgeCheck" },
  { id: "trust", title: "A trust engine between you and the scam", body: "Salary outliers, brand-new domains, template spam, fees asked up front. Postings it holds never reach the feed — the decision is honoured, not displayed as decoration — and the reasons stay readable so you can judge the verdict yourself.", icon: "ShieldCheck" },
  { id: "matching", title: "A match score that explains itself", body: "Your skills, experience, location and work-mode preferences compared with each role, newest roles weighted — with the reasons attached. A score you can argue with is more useful than a score you cannot.", icon: "Target" },
  { id: "documents", title: "Documents drafted for the role", body: "A CV, resume, cover letter or application email written from your own information and shaped to that specific job. Edit it, then export to PDF or Word.", icon: "FileText" },
  { id: "offline", title: "Works on the connection you have", body: "The Android app keeps your applications and documents available offline and syncs when signal returns — because a job search in Nairobi has to survive the power going out, and so should your data.", icon: "WifiOff" },
];

const faq = [
  { id: "what-is-mboqara", question: "What does MboQara do?", answer: "MboQara helps you discover job opportunities, understand how they fit your profile, prepare application documents and track your application steps." },
  { id: "how-matching-works", question: "How are matches calculated?", answer: "We compare your skills, experience, preferences and location with each role, and give newer roles extra attention. Results are guidance to help you review a role, not a hiring guarantee." },
  { id: "does-it-apply", question: "Does MboQara submit applications for me?", answer: "No. MboQara helps you prepare and organise your application. You review your materials and submit through the employer's application channel." },
  { id: "documents", question: "Can I edit generated documents?", answer: "Yes. Generated documents can be reviewed and edited before you export or use them." },
  { id: "mobile-offline", question: "Can I use the mobile app offline?", answer: "Yes. The app keeps your roles and application details available offline, and sends your changes across when your connection returns." },
  { id: "data-control", question: "Who controls my application decisions?", answer: "You do. MboQara provides information and preparation tools; you choose which roles to pursue and when to share or submit documents." },
  { id: "pricing", question: "Is MboQara free?", answer: "Yes. Founding access is free during beta, with no credit card and no charges until paid plans launch. Founding members keep free access for life." },
  { id: "coverage", question: "Which countries and job types are covered?", answer: "MboQara aggregates roles from supported job boards and company career pages worldwide, including full-time, part-time, contract, internship and remote roles." },
  { id: "ai-documents", question: "Does MboQara write my CV for me?", answer: "MboQara drafts role-focused CVs and cover letters from the information you provide, and shows how your experience connects to the role. You review, edit and approve everything before exporting or applying." },
  { id: "ai-training", question: "Is my data used to train AI models?", answer: "No. Your profile, CVs and documents are not sold, and they are not used to train third-party AI models." },
  { id: "android-ios", question: "Can I use MboQara on my phone?", answer: "Yes. The Android app is available on Google Play and supports offline access to saved roles and application details. The web app works in any modern browser, and an iOS build is planned." },
  { id: "delete-data", question: "How do I delete my account or data?", answer: "Contact mboqara@angisoft.co.ke from your registered email address and we will process the request. You can also remove connected providers from Settings." },
  { id: "auto-apply", question: "Will MboQara apply for jobs on my behalf?", answer: "An application agent is on the roadmap. It is planned to read each job description, sign in to the employer's site, complete the fields, attach the right documents and submit for you — with your approval before anything is sent. Today MboQara prepares the application and you submit it." },
  { id: "all-in-one", question: "How is MboQara different from other job sites and resume builders?", answer: "Most tools cover one step: a job board lists vacancies, a resume builder produces a document, a tracker records statuses. MboQara is the only workspace that carries a job seeker the whole way — finding live roles worldwide, scoring them against your profile, drafting the CV, cover letter and application email for that specific role, and then tracking every stage and follow-up, online or offline on Android." },
];

const legalPrivacy: Section[] = [
  {
    id: "controller",
    title: "Who is responsible",
    body: "AngiSoft Technologies, Nairobi, Kenya, is the controller for the personal information MboQara handles for your job search. Questions about this policy, the information held, and the requests below can be sent to privacy@angisoft.co.ke from your registered email address.",
  },
  {
    id: "information-handled",
    title: "The information we handle",
    body: "We handle your account details, candidate profile, preferences, uploaded and generated documents, saved opportunities, match scores, application stages, reminders, connected apps, browser-agent pairing status, application submission history and support messages. You can use some features without sharing optional profile details, but discovery, matching and document preparation need the profile and source documents you choose to provide.",
  },
  {
    id: "how-used",
    title: "How it is used",
    body: "We use your profile to rank live roles and explain fit, to prepare role-specific documents you request, to organise your applications and reminders, to keep your account secure, and to diagnose and improve the service. We do not use your CV, profile, answers or generated documents to train third-party AI models.",
  },
  {
    id: "legal-basis",
    title: "Consent, contract and legitimate interests",
    body: "We rely on consent where we ask for it, on contract to provide the service you signed up for, and on legitimate interests to operate, secure and improve the platform. Consent can be withdrawn at any time without affecting processing that had a valid independent basis at the time.",
  },
  {
    id: "ai-assistance",
    title: "AI-assisted drafting",
    body: "When you ask for a CV, cover letter, application email, summary or drafted answer, your profile and the information you supplied are used to produce that result. AI-assisted text is a starting point: it can be incomplete or wrong, and it is your responsibility to review it before you send it to an employer.",
  },
  {
    id: "applications",
    title: "Application preparation and browser run",
    body: "If you ask MboQara to prepare an application package, we store a package linked to that role and your approved documents. A linked browser agent is used only when you approve that package. It works on the employer's application page you requested, uses the approved document pages, and can be cancelled or revoked. We do not send an application without your approval.",
  },
  {
    id: "providers",
    title: "Service providers and hosts",
    body: "We use trusted providers for hosting, authentication, object storage, email, job discovery and delivery. They process your information only to deliver those services under our instructions. We do not sell your personal information and we do not share it for advertising or cross-site tracking.",
  },
  {
    id: "retention",
    title: "How long we keep information",
    body: "We keep account, profile, application and document information while your account is active and while we need it to provide the service. When you delete a document, application or account, we remove the working copy within thirty days unless a longer period is needed for legal, security or fraud-prevention reasons. Backups and operational logs age out on a limited schedule.",
  },
  {
    id: "security",
    title: "How information is protected",
    body: "Access to your account and stored documents is authenticated, authorisation is checked on every request, document download links are time-limited, and operational credentials are kept out of public code. No system is perfect, so tell us immediately if anything looks wrong; see the security page for the measures in place and how to report an issue.",
  },
  {
    id: "rights",
    title: "Your rights and choices",
    body: "You can review and edit your profile, delete documents and applications, control matching and automatic preparation, disconnect connected providers, and request export or deletion of your information. You may object to processing you think is unnecessary. We will tell you if a request cannot be completed fully and why.",
  },
  {
    id: "cookies",
    title: "Cookies and browser storage",
    body: "This site stores a first-party sign-in cookie, your theme, a page cache and an offline action queue. No advertising cookies or cross-site trackers are set. The cookie notice lists each item, why it exists, and how to clear it.",
  },
  {
    id: "children",
    title: "Age and responsibility",
    body: "MboQara is for people who can enter an employment relationship in their jurisdiction. Children should not create accounts. If you are preparing materials for someone else, only submit information you are allowed to share and only with that person's knowledge.",
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: "If this policy changes materially, we will update this page and the effective date. Continuing to use the service after a change does not make your submitted content approved; you still review and approve documents and application packages yourself.",
  },
  ];

const legalTerms: Section[] = [
  {
    id: "service",
    title: "The service",
    body: "MboQara helps you discover live job opportunities, understand how a role may fit your profile, prepare role-specific application documents, and organise your applications. It is currently a free founding-access beta. Features, coverage and availability may change while it is built.",
  },
  {
    id: "account",
    title: "Your account",
    body: "You are responsible for your account, for the devices and connected apps linked to it, and for keeping credentials secure. Tell us promptly if access is lost or a device cannot be trusted. We may suspend an account that is used to abuse the service, misrepresent a candidate, interfere with employers, or break the law.",
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: "Use MboQara for your own job search, with accurate information about your experience, on the employers' own terms. The acceptable use policy explains the rules for honest applications, account security, AI-assisted use, and how to report a security problem privately.",
  },
  {
    id: "listings",
    title: "Third-party job listings",
    body: "Listings come from external sources and can change or disappear without notice. Availability, deadlines, requirements, salary, location and application instructions must be checked with the employer before you apply. MboQara does not guarantee that a listing is still open, accurate, legitimate, or that the employer will read an application.",
  },
  {
    id: "ai-content",
    title: "Generated content",
    body: "AI-assisted match explanations, CVs, cover letters, emails, summaries and drafted answers can contain errors or omit context. You remain responsible for reviewing and correcting generated content before you export, share or submit it. Do not use generated text to falsify employment, education, licences, references, identity or right-to-work status.",
  },
  {
    id: "documents",
    title: "Your documents and submissions",
    body: "You decide whether to edit, export, share or delete a document. You approve an application package before it can be used by a linked browser agent, and you may cancel a run at any time. MboQara does not guarantee interviews, offers or employment outcomes.",
  },
  {
    id: "payments",
    title: "Free beta and future pricing",
    body: "Founding access is free during beta and no credit card is required. If a paid plan is introduced, we will publish the price and terms before charging anyone. Founding members keep their stated free access for life.",
  },
  {
    id: "privacy",
    title: "Your information",
    body: "Your use is also governed by the privacy policy and the consent choices page, which explain what information MboQara handles, how long it is kept, how to withdraw consent, and how to request a copy or deletion of your information.",
  },
  {
    id: "liability",
    title: "Disclaimer and liability",
    body: "The service is provided on an as-is and as-available basis. To the extent permitted by law, AngiSoft Technologies is not liable for indirect or consequential loss, missed job opportunities, employer decisions, or actions taken by other services you connect. Nothing in these terms limits liability that cannot be limited by law.",
  },
  {
    id: "indemnity",
    title: "Your responsibility for applications",
    body: "You agree to indemnify AngiSoft Technologies against claims arising from unlawful use of the service, from information you submit that you were not entitled to submit, and from applications or communications you send to employers.",
  },
  {
    id: "law",
    title: "Governing law and changes",
    body: "These terms are governed by the laws of Kenya. If a material change affects your use of the service, we will publish the change on this page. Contact legal@angisoft.co.ke with a question about these terms.",
  },
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
  "faq/hero": hero("faq-hero", "Questions? We have answers", "Frequently asked questions", "Learn how mboqara supports opportunity discovery, document preparation and application tracking."),
  faq,
  "pricing/hero": hero("pricing-hero", "Free during beta. No credit card.", "Pricing", "Founding access is free during beta. We will publish updated pricing before any paid plans launch."),
  "pricing/plans": [{
    id: "beta-access", name: "Founding access", badge: "Free during beta", price: 0, period: "during beta",
    description: "Use the current mboqara features while we build and improve the service.",
    features: [
      { id: "discovery", label: "Opportunity search and matching", included: true },
      { id: "tracking", label: "Application and follow-up tracking", included: true },
      { id: "documents", label: "Document preparation and export", included: true },
    ],
    ctaLabel: "Create a profile", ctaHref: "/signup",
  }],
  "stories/hero": hero("stories-hero", "Different paths. One place to keep moving.", "Career stories", "mboqara supports the real work behind a job search: finding an opening, preparing your materials and following through."),
  stories: [],
  "security/hero": hero("security-hero", "Your privacy and security", "Security", "We use authenticated access and role checks to protect account features. Review the details below and contact us with security questions."),
  security: [
    { id: "account-access", title: "Account access", body: "You sign in to reach your profile and your applications. Our team only reaches your account information when they need to help you." },
    { id: "transport", title: "Transport and configuration", body: "Your connection is encrypted, and service credentials are kept out of public code." },
    { id: "uploads", title: "Documents and uploads", body: "Your uploads are stored privately and shared through time-limited links. Keep exported copies in a location you control." },
  ],
  "privacy/hero": hero(
    "privacy-hero",
    "Privacy Policy",
    "Your information",
    "Last updated 23 November 2026. What MboQara handles, why, who processes it, how long it is kept, and how to request access, export or deletion.",
  ),
  privacy: legalPrivacy,
  "terms/hero": hero(
    "terms-hero",
    "Terms of Service",
    "Using MboQara",
    "Last updated 23 November 2026. How the beta service works, what we do not promise, and how your account and applications are governed.",
  ),
  terms: legalTerms,
  "download/hero": hero("download-hero", "Your job search, wherever you are", "mboqara for Android", "Browse roles, track your applications, review your documents and pick up where you left off from your phone."),
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
