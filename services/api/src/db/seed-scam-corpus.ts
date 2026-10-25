import { query } from "./pool.js";
import { simhash } from "../services/opportunity/risk.js";

interface ScamTemplate {
  label: string;
  company: string;
  title: string;
  description: string;
}

const templates: ScamTemplate[] = [
  {
    label: "advance_fee",
    company: "Global Trading Ltd",
    title: "Work from home - Earn $5000 weekly, no experience needed",
    description:
      "We are looking for a work from home assistant to handle simple customer tasks and forwarding. No experience required and no interview. You will receive $500 for every set of tasks completed. A small processing fee of $200 is required upfront to cover our international shipping and handling charges. Payment is processed daily. Reply with your full name, home address, bank account number and copy of your national ID to begin immediately.",
  },
  {
    label: "fake_check",
    company: "Pacific Logistics International",
    title: "Immediate hire - Administrative assistant (apply today)",
    description:
      "A cheque for $2,800 will be issued to you to purchase shipping materials and equipment for our expanding branch. Once the work is complete you will be allowed to keep a percentage of the total shipment value. You must deposit the cheque and transfer the remaining amount to our supplier within 24 hours. All fees are covered by the company, there is no cost to you.",
  },
  {
    label: "money_mule",
    company: "Swift Remittance Services",
    title: "Financial Operations Assistant (remote, immediate start)",
    description:
      "You will receive funds into your personal bank account and transfer them to our business partner accounts. In return you will keep 8 percent of every transaction as commission. We do not require any deposit or fee. Your task is to maintain a daily transaction log and send the remaining balance to the account provided each morning.",
  },
  {
    label: "crypto_trading",
    company: "Apex Digital Assets",
    title: "Crypto Trading Assistant - earn daily returns",
    description:
      "Our company guarantees daily trading returns of 3 percent on your deposit. You will receive trading instructions and a personal dashboard to follow. Deposit funds to the linked account and your earnings are credited instantly. Guaranteed returns with no risk. We have partnered with the world's largest exchanges and our mentors will coach you through your first trades.",
  },
  {
    label: "mlm_recruitment",
    company: "Global Wellness Network",
    title: "Join our team and earn from home",
    description:
      "This is a ground floor opportunity with unlimited income potential. You will recruit new members into the network and earn a commission on every membership sold. No inventory, no product handling, no shipping. Our training and materials are provided. Many of our members earn over $10,000 per month working only a few hours a day from home.",
  },
  {
    label: "romance_fraud",
    company: "Helix International",
    title: "Personal assistant to a business executive",
    description:
      "I am a busy executive based overseas and I need someone trustworthy to manage my correspondence and handle small personal errands. I will sponsor your training and travel costs. To begin, please send a copy of your identity card, proof of address and your bank details so I can arrange your first payment and travel documents.",
  },
  {
    label: "visa_fee",
    company: "Continental Overseas Services",
    title: "Work permit processing - sponsorship available",
    description:
      "We will process your work permit and visa documentation. A processing fee of $450 is required to cover the government charges, health certificate and courier. The fee is fully refundable once you receive your permit. Send your passport copy and pay the processing fee to proceed with the application this week.",
  },
  {
    label: "identity_theft",
    company: "Secure Verification Services",
    title: "Identity verification agent (remote)",
    description:
      "You will receive a batch of customer records to verify by calling our clients. You will be provided with a temporary account to access our verification portal. Please do not share the login with anyone. Successful agents earn $180 per day plus performance bonuses and can progress to senior verification within one month.",
  },
  {
    label: "no_experience_forever",
    company: "Bright Future Opportunities",
    title: "No experience needed - start earning today",
    description:
      "No experience required, no qualifications needed, no interview. You can start today and earn from your first task. All you need is a phone and an internet connection. Many of our new team members have never worked online before and still earn well within their first month. Sign up now and start earning immediately.",
  },
  {
    label: "government_impersonation",
    company: "Ministry of Employment and Skills",
    title: "Recruitment notice - list of successful candidates",
    description:
      "Following the conclusion of our recruitment exercise, the names of shortlisted candidates have been published. Successful candidates are required to pay a non-refundable verification fee of $120 to the revenue account to complete registration and collection of the recruitment letter and identification tags.",
  },
  {
    label: "upfront_equipment",
    company: "Elite Home Business",
    title: "Regional sales representative - tools provided",
    description:
      "Successful candidates will receive a complete starter kit including a laptop, printer and sales materials valued at $1,850. To release this kit a refundable deposit of $300 is required. The deposit is returned after the first month of sales. Duties include reaching out to local shops and promoting our household products.",
  },
  {
    label: "data_reselling",
    company: "LeadSphere Media",
    title: "Data annotation specialist (part time)",
    description:
      "You will receive customer datasets on your personal device and classify records according to our guidelines. Payment is released weekly by international transfer. We need your bank details and national identification number for the payment register. All work is done on your own laptop so no equipment cost is involved.",
  },
  {
    label: "reshipping_mule",
    company: "Global Parcel Bridge",
    title: "Package forwarding assistant - work from home",
    description:
      "You will receive packages at our local address and forward them to our international warehouse. We will cover all shipping costs. To register you as our agent we require a small one time registration charge of $80 which covers the insurance and handling of the first parcel.",
  },
  {
    label: "fake_recruiter_agency",
    company: "TalentBridge Partners",
    title: "Recruitment consultant - immediate onboarding",
    description:
      "We have been retained by a leading multinational to shortlist candidates for a confidential role. Successful applicants will receive an onboarding allowance. Please note that a nominal documentation charge of $150 applies before the client interview is scheduled to cover candidate verification and background screening.",
  },
  {
    label: "investment_return",
    company: "Meridian Capital Partners",
    title: "Remote investment analyst",
    description:
      "Our investors receive an average monthly return of 12 percent managed by our internal research desk. You will support the desk by reviewing investor statements and executing approved transfers. No capital is required from you. You will be given access to our internal platform and training on our proprietary analysis tools.",
  },
  {
    label: "job_scraper_repost",
    company: "TalentPool Worldwide",
    title: "Work from home - earn $300-5000 weekly, no experience needed",
    description:
      "We are looking for a work from home assistant to handle simple customer tasks and forwarding. No experience required and no interview. You will receive $500 for every set of tasks completed. A small processing fee is required upfront to cover international shipping and handling charges. Payment is processed daily. Reply with your full name and bank details to begin immediately.",
  },
];

async function main(): Promise<void> {
  let inserted = 0;

  for (const template of templates) {
    const fullHash = simhash(`${template.company} ${template.title} ${template.description}`);
    const descriptionHash = simhash(template.description);

    for (const [label, hash] of [
      ["full", fullHash],
      ["description", descriptionHash],
    ] as const) {
      const hashText = hash.toString();
      const existing = await query<{ id: string }>(
        "SELECT id FROM scam_signatures WHERE simhash = $1 AND label = $2",
        [hashText, `${template.label}:${label}`],
      );
      if (existing.rows[0]) continue;

      await query(
        `INSERT INTO scam_signatures (simhash, label, sample_url)
         VALUES ($1::bigint, $2, $3)`,
        [hashText, `${template.label}:${label}`, null],
      );
      inserted += 1;
    }
  }

  const total = await query<{ count: string }>(
    "SELECT count(*)::text AS count FROM scam_signatures",
  );
  console.log(`inserted=${inserted} total=${total.rows[0]?.count ?? 0}`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
