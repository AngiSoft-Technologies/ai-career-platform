/**
 * Canonical FAQ copy. Shared by the FAQ page UI fallback, the FAQPage
 * JSON-LD block and llms-full.txt so search engines and AI assistants always
 * see the same answers.
 */
export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "what-is-mboqara",
    question: "What does MboQara do?",
    answer:
      "MboQara helps you discover job opportunities, understand how they fit your profile, prepare application documents and track your application steps.",
  },
  {
    id: "how-matching-works",
    question: "How are matches calculated?",
    answer:
      "We compare your skills, experience, preferences and location with each role, and give newer roles extra attention. Results are guidance to help you review a role, not a hiring guarantee.",
  },
  {
    id: "does-it-apply",
    question: "Does MboQara submit applications for me?",
    answer:
      "No. MboQara helps you prepare and organise your application. You review your materials and submit through the employer's application channel.",
  },
  {
    id: "documents",
    question: "Can I edit generated documents?",
    answer:
      "Yes. Generated CVs, cover letters and application documents can be reviewed and edited before you export or use them.",
  },
  {
    id: "mobile-offline",
    question: "Can I use the mobile app offline?",
    answer:
      "Yes. The app keeps your roles and application details available offline, and sends your changes across when your connection returns.",
  },
  {
    id: "data-control",
    question: "Who controls my application decisions?",
    answer:
      "You do. MboQara provides information and preparation tools; you choose which roles to pursue and when to share or submit documents.",
  },
  {
    id: "pricing",
    question: "Is MboQara free?",
    answer:
      "Yes. Founding access is free during beta, with no credit card and no charges until paid plans launch. Founding members keep free access for life.",
  },
  {
    id: "coverage",
    question: "Which countries and job types are covered?",
    answer:
      "MboQara aggregates roles from supported job boards and company career pages worldwide, including full-time, part-time, contract, internship and remote roles.",
  },
  {
    id: "ai-documents",
    question: "Does MboQara write my CV for me?",
    answer:
      "MboQara drafts role-focused CVs and cover letters from the information you provide, and shows how your experience connects to the role. You review, edit and approve everything before exporting or applying.",
  },
  {
    id: "ai-training",
    question: "Is my data used to train AI models?",
    answer:
      "No. Your profile, CVs and documents are not sold, and they are not used to train third-party AI models.",
  },
  {
    id: "android-ios",
    question: "Can I use MboQara on my phone?",
    answer:
      "Yes. The Android app is available on Google Play and supports offline access to saved roles and application details. The web app works in any modern browser, and an iOS build is planned.",
  },
  {
    id: "delete-data",
    question: "How do I delete my account or data?",
    answer:
      "Contact hello@angisoft.co.ke from your registered email address and we will process the request. You can also remove connected providers from Settings.",
  },
  {
    id: "auto-apply",
    question: "Will MboQara apply for jobs on my behalf?",
    answer:
      "An application agent is on the roadmap. It is planned to read each job description, sign in to the employer's site, complete the fields, attach the right documents and submit for you — with your approval before anything is sent. Today MboQara prepares the application and you submit it.",
  },
  {
    id: "all-in-one",
    question: "How is MboQara different from other job sites and resume builders?",
    answer:
      "Most tools cover one step: a job board lists vacancies, a resume builder produces a document, a tracker records statuses. MboQara is the only workspace that carries a job seeker the whole way — finding live roles worldwide, scoring them against your profile, drafting the CV, cover letter and application email for that specific role, and then tracking every stage and follow-up, online or offline on Android.",
  },
];
