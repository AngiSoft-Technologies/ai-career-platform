# Job discovery and application workflow

This document describes the flow the authenticated web app is being changed to
implement, and the boundaries that cannot be wished away.

## 1. Discover

- `/dashboard` shows the five roles posted on the current UTC calendar day that
  the candidate is qualified for. "Qualified" means the posting is active, not
  held by the trust engine, explicitly eligible for the candidate, and the
  computed match is at least 60. If fewer than five exist, the UI says so; it
  does not pad the list with older or weaker roles.
- `/opportunities` is the full catalogue. It defaults to all roles, not a
  ranked subset, and filters by free text, country, work mode (remote, hybrid,
  on site), seniority, employment type, eligibility and profession.
- `/saved` lists wish-listed roles. Saving uses `feed_state.saved_at`; the feed
  state endpoint supports clearing the flag.

## 2. Evaluate a role

`/opportunities/:id` is a decision page, not a disguised application form. It
shows:

- the job description, with structured responsibilities and requirements taken
  from the durable preparation analysis when the posting omits them;
- the hiring company;
- strengths and gaps measured against the candidate's default (base) resume;
- concrete proposed resume improvements that can be saved in the document
  editor;
- **Add to wish list**, **Apply** and **Go back**.

AI-derived copy is labelled as such. Salary, employer and posting facts are
never invented.

## 3. Stage 1 — prepare

`/applications/:id` uses the durable preparation record:

1. prepare the package for the opportunity;
2. answer only the questions the agent cannot answer truthfully;
3. review and amend the tailored CV, cover letter, email and answers;
4. approve the exact package.

Approval fingerprints the document set. Editing any document after approval
revokes it and requires a fresh approval; this prevents a changed file being
submitted under an old approval.

## 4. Stage 2 — submit

`/applications/:id/apply` is a full-page workspace, not a small embedded card.

- **Email employers**: the approved recipient, subject and message pre-fill a
  Gmail compose tab, and the approved PDF snapshots are offered as downloads to
  attach. Browsers do not let a URL attach files to Gmail, so the candidate
  attaches them and sends the message; the app records APPLIED only after the
  candidate confirms it. The recipient is set during stage 1 so changing it
  cannot bypass approval.
- **Web/ATS employers**: a remote browser workspace renders the employer site
  in the route. A guidance agent observes the page, shows contextual hints,
  fills approved fields, uploads approved PDFs and stops at human-only steps
  (registration, passwords, OTP, payment, legal attestation, CAPTCHA). Final
  submit always requires explicit confirmation.
  When a site needs the candidate's own logged-in browser, the workspace can
  switch to companion-tab mode; the guidance rail remains in the app.

### What a remote browser cannot do

- A remote browser does not inherit the candidate's existing logins or cookies.
- Some employer sites detect automation or block remote/browser environments.
- An ordinary iframe cannot be used to automate a cross-origin employer page:
  `X-Frame-Options`, CSP `frame-ancestors`, same-origin policy and partitioned
  cookies all prevent it. The workspace therefore uses a real browser rather
  than pretending an iframe is one.

## 5. Learning

Successful runs may produce a sanitised site playbook: ordered step labels,
semantic field keys, known blockers and the platform name. Field values,
credentials, document ids and personal data are never stored in a playbook.
Playbooks are validated, versioned and reused to guide later candidates on the
same employer site.

## 6. Boundaries

- The Express API remains the authority for applications and status changes.
- The Next.js app is a thin client; the browser runtime is a separate
  long-running service and is not a Vercel Function.
- Push delivery stays provider-agnostic and requires operator credentials.
- No credential, OTP, payment detail or legal attestation is stored by the
  guidance agent.
