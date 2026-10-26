# Job Radar — Algorithms & Data Structures

Design targets: 10M+ active users, ~5M active opportunities, global multi-source ingestion,
sub-second search, real-time monitoring. Every choice below is derived from an expected
output, not from habit.

> **Status:** This document describes algorithm and scale-up proposals, not a claim that all
> components are implemented. The current backend is Node.js/TypeScript with Express on
> Fly.io and Neon PostgreSQL. Kafka, Roaring bitmap indexes, and other infrastructure named
> below are future design options unless present in the repository configuration and code.

## 1. Canonical opportunity deduplication

Problem: one posting appears on a company ATS, LinkedIn, a job board, and an aggregator with
different formatting. Users must see one job (jobfinder.md:4005).

- Fast path: deterministic fingerprint `sha1(company_slug | normalized_title | city |
  posted_date_bucket)` → hash index. Exact reposts collapsed in O(1).
- Slow path (near-duplicates): MinHash with 128 permutation functions over the job's token
  shingle set (3-grams). Signatures stored in a column. LSH banding 16 bands x 8 rows gives
  candidate-pair generation in O(1) per band lookup. Candidate pairs verified with Jaccard
  similarity >= 0.72; verified pairs merged by Union-Find into a canonical group.
- Output: one canonical `opportunities` row + N `opportunity_sources` provenance rows
  (company website, LinkedIn, ATS, board, original apply URL).

## 2. Matching engine

Input: a candidate profile (skills, seniority, location, work mode, roles, preferences).
Expected output: top-N ranked jobs with explanations, in milliseconds.

- Skill vocabulary is a closed set maintained in `skills` with stable integer ids.
- Each opportunity stores its requirement ids as a sorted int array.
- In-memory inverted index rebuilt every N minutes: `skill_id -> RoaringBitmap(opportunity_id)`.
- A profile query = OR over the profile's skill bitmaps, each ANDed with active-status and
  freshness bitmaps. Roaring bitmaps are compressed (critical: most jobs share common skills)
  and support SIMD popcount/AND/OR.
- Score combines: IDF-weighted skill coverage (rare skills dominate), seniority adjacency,
  location/work-mode match, role-token overlap, and freshness decay.
- Output: top-N + explanation strings built from the same factor breakdown that produced the
  score, so explanations are never fabricated after the fact.

## 3. Hybrid search

Input: free text + structured filters. Expected output: relevant jobs ranked, tolerant of
typos, and fast when filters are selective.

- Three retrievers over the same relation:
  1. Structured: B-tree / GIN on country, status, posted_at; selective filters prune first.
  2. Full text: PostgreSQL FTS + BM25 (`ts_rank_cd`) over `search_vector`.
  3. Vector: pgvector HNSW approximate nearest neighbours on `embedding`.
- Query planner chooses the cheapest selective retriever first (cardinality estimate from
  `pg_stats`-style cached counts), and only runs expensive retrievers when needed.
- Fusion: Reciprocal Rank Fusion `score(d) = sum_i 1/(k + rank_i(d))`, k = 60. RRF is
  rank-based, so it does not need per-retriever score normalization and degrades gracefully
  when one retriever returns nothing.
- Rerank (only the top ~200 fused candidates) with the profile match score.

## 4. Feed and notifications

Input: continuous stream of newly published opportunities. Expected output: each user's feed
contains their best matches without scanning all users per job.

- Inverted index `preference_key -> user bitmap` (country, skill, work mode, role family).
- On publish: candidate users = union of the job's preference bitmaps (Roaring OR).
- Each candidate scored, pushed into a per-user max-heap keyed by
  `match_score * exp(-lambda * age_hours)`, so the feed is a time-decayed priority queue.
- Emission rule: notify only when the heap's new head exceeds the user's notification
  threshold and the dedupe budget has not been spent.

## 5. Fraud and ghost-job detection

Input: a raw job record. Expected output: a calibrated risk score and an action, before the
job ever reaches a user.

Signals (each is a numeric feature):
- Domain age from WHOIS/registration date; newly registered domain (< 90 days) is suspicious
  for an "employer".
- TLS certificate validity and issuer.
- Salary z-score against the profession's salary distribution (from the taxonomy closure).
  |z| > 3 is a strong signal.
- Contact-email domain vs company domain mismatch.
- Text perplexity proxy: ratio of stop-word/rare-token mix and duplicate n-gram rate.
  Template spam has near-zero perplexity.
- SimHash (64-bit) of the description; Hamming distance <= 3 against the known scam corpus is a
  near-certain template match.
- Company cross-reference: does the company exist in the registry with a matching domain and
  country?
- Aggregation heuristic: number of distinct postings from the same domain in 24h (bulk posting
  is a classic ghost-job pattern).

Composite: weighted logistic regression over the features, weights calibrated on a labelled
seed set (known scam corpora + verified real postings). Output:
`risk_score 0-100`, `risk_flags[]`, and action `publish | hold | reject`. Held jobs go to the
curator queue; the same MinHash index from section 1 exposes scam clusters.

## 6. Profession taxonomy

Problem: "all professions in all domains" must be queryable without a hardcoded list.

- Self-referencing `professions` table with `parent_id`.
- Closure table `profession_closure(ancestor, descendant, depth)` rebuilt on change gives
  "all descendants of Healthcare" in one indexed query.
- Materialized path (`mpath`) for cheap subtree rendering in breadcrumbs and filters.
- DAG, not tree: "Data Analyst" has parents in both Technology and Finance.

## 7. Event pipeline

- Append-only `events` table (and Kafka when volume requires it) with topics
  `opportunity.published`, `opportunity.deduplicated`, `opportunity.risk_scored`,
  `candidate.profile.updated`, `match.completed`, `application.created`,
  `application.status.changed`, `application.followup.due`, `document.generated`,
  `notification.sent`.
- Projections (materialized views) are derived state: career intelligence, funnel metrics,
  source freshness. Rebuildable by replay, which is the property that makes the platform
  auditable and the models learnable.

## 8. Document pipeline

- One normalized document AST per generated artefact (sections, entries, bullets, metadata).
- ATS validator runs on the AST: single-column, no tables/images, no text in headers/footers,
  standard section headings, parseable dates, keyword coverage against the target job.
- Serializers: PDF, DOCX, PPTX, image. Adding a format never touches content generation.
- Docs are private objects in object storage, referenced by key; never Postgres blobs.

## 9. Caching

- Redis holds hot feeds, computed match scores, rate-limit counters, and job-lookup cache.
- Never a source of truth (jobfinder.md:4723). Every cached value is derived from Postgres
  and expires.
- Cache stampede protection: per-key locks plus `SWR`-style background refresh for hot keys.

## 10. Expected output summary

| Concern | Structure | Complexity |
|---|---|---|
| Dedup | fingerprint hash + MinHash/LSH + Union-Find | O(1) exact, O(bands) near |
| Matching | skill inverted index + Roaring bitmaps | O(k * n/64) SIMD |
| Search | B-tree + GIN/BM25 + HNSW, RRF fusion | O(log n) + O(rerank) |
| Feed | inverted index + per-user heap | O(log n) per publish |
| Fraud | feature vector + logistic + SimHash | O(1) per job |
| Taxonomy | closure table + materialized path | O(log n) subtree |
| Events | append-only log + projections | O(1) append |
