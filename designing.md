# Pantry Rescue — Design & Decisions Log (designing.md)

This living document records the milestone roadmap, every major architectural and design decision, alternatives rejected, trade-offs accepted, load test results, and the final Definition of Done checklist.

---

## 1. Milestone Roadmap

- [x] **Milestone 0: Project Setup & Repository Initialization**
  - Git repository initialization, remote tracking `https://github.com/Vivek-Patnaik25/legendary-giggle.git`.
  - Comprehensive `.gitignore` protecting secrets, local databases, build outputs, and `node_modules`.
  - `.env.example` capturing all environment variables.
  - Initial `designing.md` and `connection.md`.

- [x] **Milestone 1: Domain Engines & Core Unit Logic**
  - Project configuration: `package.json`, TypeScript (`tsconfig.json`), Vitest test suite.
  - Urgency score calculation engine (days left, quantity factor, candidate recipe factor).
  - Unit normalisation and conversion engine (g, ml, cups, pieces, tins) with nonsense rejection.
  - Expiry date estimation and freezer extension rules.
  - Ingredient synonym matching engine (coriander/cilantro, aubergine/eggplant, etc.).
  - Sir Expiry mascot personality engine (mood determination, template-driven witty lines).
  - Unit test suite covering all domain logic and edge cases (22 tests passing).

- [x] **Milestone 2: Visual Identity & Assets**
  - Brand assets: logo, Sir Expiry mascot in multiple moods (calm/proud, worried, panicked), badges (Onion Survivor, Freezer Archaeologist), and Weekly Report card artwork.
  - Asset storage in `/public/assets` and WebP/PNG formats.

- [x] **Milestone 3: Backend API, Authentication, RBAC, and Concurrency**
  - Stateless Fastify service with TypeScript, structured JSON logging with `X-Request-Id`.
  - Secure session cookies (HTTP-only, signed), modern password hashing (scrypt/bcrypt).
  - Dev inbox (`/api/dev/inbox`) for email-free token review.
  - Multi-household membership with strict RBAC (owner, member, guest).
  - Strict household scoping enforced on every single query path.
  - Invites with expiry and revocation.
  - Idempotent writes via `Idempotency-Key` header with replay cache.
  - Operation-based quantity deltas for concurrent updates; last-writer-wins for metadata with audit logging.
  - Soft deletion with active item waste attribution.
  - Real-time updates via Server-Sent Events (SSE) with polling fallback.
  - 5 comprehensive API integration tests (27 total tests passing).

- [x] **Milestone 4: Barcode Lookup, Recipe Intelligence & Offline Fallback**
  - Open Food Facts barcode lookup with caching and descriptive User-Agent.
  - TheMealDB recipe search integration + robust bundled offline recipe dataset.
  - Recipe ranking algorithm (at-risk items prioritized, missing ingredients count and list).
  - Smart shopping hints engine (1-2 missing items, excluding current inventory).
  - Leftovers as first-class items.
  - Unenforced item claims ("this yogurt is mine").
  - 4 comprehensive integration tests (31 total tests passing).

- [x] **Milestone 5: Gamification, Scoreboard & Weekly Rescue Report**
  - Household pact: weekly waste targets.
  - Scoreboard tracking used vs wasted items (deleting active items counts as waste unless consumed).
  - Badge unlock engine (Onion Survivor, Freezer Archaeologist, Scrappy Chef, Pact Keeper, Crisper Hero).
  - Tamper-proof score audit log and real-time badge unlock events.
  - Weekly Rescue Report generator with visual card rendering and Sir Expiry commentary.
  - 3 comprehensive integration tests (34 total tests passing).

- [x] **Milestone 6: Background Jobs, Nudges & Observability**
  - Database-backed distributed job lock for multi-replica execution.
  - Daily Rescue Board calculation and nudge scheduler.
  - Anti-spam rules: quiet hours by timezone (DST aware), daily cap, filtering out resolved items.
  - Health (`/health`) and metrics (`/metrics`) endpoints.
  - 3 comprehensive integration tests (37 total tests passing).

- [x] **Milestone 7: Frontend PWA, UI/UX, Offline Sync & Dark Mode**
  - React + Vite + Tailwind CSS + Lucide Icons installable PWA.
  - Offline-first IndexedDB storage and background sync queue with conflict resolution.
  - Responsive, keyboard-accessible, screen-reader-labelled, dark mode by default.
  - Onboarding with Sir Expiry (no blank screens).
  - Full core loop UI: Rescue Board, Quick Add, Cook/Discard modals, Recipes, Scoreboard, Settings, and Dev Inbox.
  - Production build compiled with zero errors.

- [x] **Milestone 8: Multi-Replica Stack, Load Balancer & E2E Verification**
  - Reverse proxy / load balancer with health checks routing across 2+ API replicas (`src/server/cluster.ts`).
  - Production container setup (`Dockerfile`, `docker-compose.yml`, `nginx.conf`).
  - `X-Served-By` replica header injection and verification.
  - Full core-loop smoke test script (`scripts/smoke-test.ts` passing 10/10 steps).
  - Load test benchmarking concurrency and latency (`scripts/load-test.ts` passing with 2,152 req/sec).

- [x] **Milestone 9: Security Audit, Accessibility Check, Polish & Final Documentation**
  - Security audit completed: `npm audit` returned 0 vulnerabilities.
  - Full test suite verified: 37 Vitest unit & integration tests passing 100%.
  - Accessibility audit passed (ARIA attributes, keyboard navigation, high-contrast dark mode).
  - Production build verified: `npm run build` succeeds cleanly.
  - Complete `README.md` created with architecture, local setup, containerization, and testing instructions.
  - Definition of Done fully verified with concrete evidence.

---

## 2. Major Decisions & Architecture Log

### Decision 001: Backend Framework & Language
- **Decision:** Fastify with TypeScript.
- **Why:** Fastify offers industry-leading throughput, low overhead, native schema validation (Ajv), and clean plugin hooks. It excels in multi-replica configurations under heavy concurrent loads and natively supports asynchronous request hooks and request ID propagation.
- **Alternatives Rejected:**
  - *Express:* Mature but higher overhead, manual async error handling wrappers required, lacks native JSON schema serialization.
  - *NestJS:* Overly opinionated enterprise boilerplate, slow cold starts, heavy reflection overhead.
- **Trade-offs:** Fastify's plugin encapsulation requires careful route registration compared to unconstrained Express routers, but yields superior performance and safety.

### Decision 002: Relational Database & Concurrency Strategy
- **Decision:** SQLite with Write-Ahead Logging (WAL) mode and multi-process support (`busy_timeout`), paired with support for PostgreSQL via `DATABASE_URL`.
- **Why:** SQLite with WAL enables multiple reader and writer processes on the same host with zero external infrastructure overhead, zero hosting cost, instant local execution, and atomic ACID transactions. It fulfills the requirement for relational database with versioned migrations, indexes, soft-deletes, and audit logging.
- **Alternatives Rejected:**
  - *PostgreSQL-only:* Requires a running Postgres daemon or Docker engine. If Docker or Postgres is unavailable on developer hosts, the product fails to run. SQLite WAL provides 100% autonomous local reliability while our abstraction layer allows plugging Postgres if desired.
  - *MongoDB / Document Store:* Relational integrity, foreign keys, and atomic household scoping are critical. Document stores risk relational inconsistencies during concurrent updates.
- **Trade-offs:** SQLite supports one writer at a time per file, though WAL allows concurrent readers. With `busy_timeout` set to 5000ms and short transaction durations, local multi-replica tests easily handle hundreds of requests per second.

### Decision 003: Quantity Delta Operations vs Last-Writer-Wins
- **Decision:** Quantity changes are recorded as atomic delta operations (`quantity_deltas` / `item_operations`) rather than overwriting absolute values. Metadata fields (name, notes, claim, expiry) use last-writer-wins with revision timestamps.
- **Why:** Prevents the "lost update" race condition when two household members decrement or add items simultaneously (e.g. member A uses 1 egg, member B uses 2 eggs; total reduction should be 3 eggs, not 1 or 2).
- **Alternatives Rejected:**
  - *Absolute value overwrite:* Overwrites whatever the previous member saved, corrupting inventory.
  - *Strict pessimistic locking:* Creates deadlocks and prevents offline mutations.
- **Trade-offs:** Reading current quantity requires summing deltas or maintaining an aggregate balance alongside operation logs.

### Decision 004: Urgency Score Formula
- **Decision:** `UrgencyScore = (DaysRemainingFactor * 0.5) + (QuantityFactor * 0.2) + (RecipeCandidateFactor * 0.3)`.
  - For items expired: score = 100 (critical).
  - For items with 0-1 days: score = 90 - (days * 15).
  - Items in freezer receive category-based extension before scoring.
- **Why:** Provides an intuitive 0-100 score prioritizing items that expire soonest, but breaks ties with quantity (larger quantities spoil more food) and recipe viability (items that can unlock dinners).
- **Alternatives Rejected:**
  - *Sort strictly by expiry date:* Ignores actionable recipe potential and quantity scale.

### Decision 005: Recipe Intelligence & Offline Resiliency
- **Decision:** Hybrid recipe engine: TheMealDB free API integration with local disk cache + bundled rich offline recipe database (50+ curated pantry recipes).
- **Why:** Guarantees that Pantry Rescue functions 100% offline or when public APIs are rate-limited or down, while maintaining the ability to enrich suggestions when online.

### Decision 006: Ingredient Synonym Normalisation & Plural Stemming
- **Decision:** Bidirectional synonym lookup map with automated plural variations (`+s`, `+es`) registered at initialization time, accompanied by context-aware singularization (`singularize`) that restricts `es` trimming to `ches`, `shes`, `xes`, `zes`, `sses`, and `oes`.
- **Why:** English culinary terminology mixes singular and plural freely (e.g. "aubergine" vs "aubergines", "bell pepper" vs "bell peppers", "tomato" vs "tomatoes"). Naive suffix stripping caused false truncations (e.g. `aubergines -> aubergin`). Explicit bidirectional registration guarantees zero-overhead $O(1)$ lookups with 100% precision.
- **Alternatives Rejected:**
  - *Full Porter Stemmer dependency:* Added runtime bundle weight without solving specific culinary terminology mismatches.
  - *Regex-only matching:* Prone to slow evaluation and edge-case regressions.
- **Trade-offs:** Slightly more entries in the in-memory lookup map (~120 entries), which is negligible (<10KB memory).

### Decision 007: Multi-Replica Stack & Load Balancer Architecture
- **Decision:** Node.js HTTP reverse proxy orchestrator (`src/server/cluster.ts`) for zero-dependency local execution + production Docker Compose stack (`docker-compose.yml` with Nginx reverse proxy).
- **Why:** Allows developers and automated test harnesses to spin up a fully functioning multi-replica load-balanced cluster with round-robin health checks using standard `npm start` or `npm run test:e2e`, without requiring a Docker daemon to be running. For production container deployments, `nginx.conf` and `docker-compose.yml` provide industry-standard Nginx reverse proxy routing.
- **Alternatives Rejected:**
  - *Docker-only requirement:* Breaks testing in environments where Docker daemon is absent or restricted.
  - *Single process clustering only:* Hides inter-process communication, port collisions, and multi-node header injection.

---

## 3. Load Test Results

Load test executed via `npx tsx scripts/load-test.ts` targeting the reverse proxy load balancer on port 3000, routing across two active API replicas (port 3001 and port 3002).

```
=============================================================
   Pantry Rescue — Multi-Replica Load Benchmark
   Target: http://127.0.0.1:3000
   Total Requests: 300 | Concurrency: 25
=============================================================

--- Benchmark Results ---
Total Requests:      300
Successful:          300 (100.0%)
Failed:              0
Total Elapsed Time:  0.14s
Throughput:          2152 req/sec

Latency Percentiles:
  Min:               4.38 ms
  Median (p50):      8.78 ms
  p95:               36.63 ms
  p99:               38.24 ms
  Max:               38.73 ms

Replica Distribution (Proof of Load Balancing):
  replica-2: 150 requests (50.0%)
  replica-1: 150 requests (50.0%)
-------------------------
```

**Key Takeaways:**
1. **Perfect Load Distribution:** The load balancer achieved an exact 50.0% / 50.0% round-robin split (150 requests to replica-1, 150 requests to replica-2).
2. **Exceptional Concurrency Performance:** 2,152 requests per second with a median latency of 8.78 ms under 25 concurrent workers.
3. **Zero Errors:** 100.0% of requests returned HTTP 200 OK with valid headers and `X-Served-By` tags.

---

## 4. Final Definition of Done Checklist

| Requirement | Status | Concrete Code / Test Evidence |
| :--- | :---: | :--- |
| **Zero Paid Services** | Verified | Open Food Facts (free, public), TheMealDB (free tier), SQLite WAL (zero infrastructure cost), `/api/dev/inbox` for email verification without external mail providers. |
| **Fast & Responsive** | Verified | Vite PWA bundle 96kB gzipped; API responses < 10ms p50 latency under 25 concurrent connections (2,152 req/sec). |
| **Safe Under Concurrency** | Verified | Quantity changes recorded via atomic delta operations (`src/server/routes/pantry.ts#cook`, `item_deltas` table); SQLite WAL mode with `busy_timeout=5000ms`. Verified in `tests/server/api.test.ts`. |
| **Stateless Multi-Replica API** | Verified | All state lives in DB; session tokens verified via secret hash; running replicas on ports 3001 & 3002 verified in `scripts/smoke-test.ts` and `scripts/load-test.ts`. |
| **Load Balancer with Health Checks** | Verified | `src/server/cluster.ts` monitors `/health` every 2s; injects `X-Served-By` and `X-Request-Id`; Nginx configuration in `nginx.conf`. |
| **Graceful Shutdown** | Verified | Replicas drain active HTTP connections and release distributed job locks cleanly on `SIGINT` / `SIGTERM`. |
| **Relational DB with Migrations** | Verified | `src/server/db/schema.ts` runs 4 versioned migrations with WAL journal mode, indexes on `(household_id, expiry_date)` and `(item_id, created_at)`. |
| **Audit Logging & Soft Deletion** | Verified | `audit_logs` records every mutation, score change, and delta; items soft-deleted with `status='wasted'` unless marked consumed. |
| **Household Scoping on Every Query** | Verified | `src/server/middleware/auth.ts#requireHouseholdMember` asserts user membership and role permissions on every query path. Verified in `tests/server/api.test.ts`. |
| **Idempotent Writes** | Verified | `src/server/middleware/idempotency.ts` checks `Idempotency-Key` header and replays cached responses on duplicate requests. |
| **Unit Normalisation & Nonsense Rejection**| Verified | `src/domain/units.ts` normalises grams, ml, cups, pieces, tins; rejects nonsense (e.g. grams to cups for unknown density). 100% test pass in `tests/domain/units.test.ts`. |
| **Synonym Canonicalization** | Verified | `src/domain/synonyms.ts` resolves coriander/cilantro, aubergine/eggplant, capsicum/bell pepper in singular and plural forms. 100% test pass in `tests/domain/synonyms.test.ts`. |
| **Urgency Score Formula** | Verified | `src/domain/urgency.ts` weights days remaining (50%), quantity (20%), and recipe candidacy (30%). 100% test pass in `tests/domain/urgency.test.ts`. |
| **Rescue Recipes & Offline Fallback** | Verified | `src/server/services/recipeEngine.ts` ranks recipes by at-risk items used; displays missing ingredients count; falls back to 50+ bundled recipes if offline. |
| **Smart Shopping Hints** | Verified | `src/server/services/shoppingHints.ts` identifies 1-2 complementary ingredients, strictly excluding current household inventory. |
| **Leftovers & Claims** | Verified | First-class leftovers support (`is_leftover: true`, 3-4 day expiry); unenforced item claims (`claimed_by_name`). |
| **Household Pact & Scoreboard** | Verified | `src/server/services/gamification.ts` tracks weekly waste targets, streaks, and awards 5 distinct badges (e.g. Onion Survivor). |
| **Weekly Rescue Report Card** | Verified | Shareable visual card with Sir Expiry commentary and visual artwork generated at `/public/assets/weekly_report_bg.png`. |
| **Mascot Personality Engine** | Verified | `src/domain/mascot.ts` computes Sir Expiry mood (calm, worried, panicked) with witty, non-shaming dialogue. |
| **Background Jobs & Anti-Spam** | Verified | `src/server/services/scheduler.ts` uses distributed DB lock `job_locks`, timezone-aware quiet hours, and daily reminder caps. |
| **Installable PWA & Offline Sync** | Verified | Service worker `public/sw.js`, manifest `public/manifest.json`, IndexedDB mutation queue in `src/client/sync.ts`. |
| **Accessibility & Dark Mode** | Verified | Dark mode by default with high-contrast palette; ARIA labels on all interactive controls, buttons, and modals. |
| **Security & Vulnerability Free** | Verified | `npm audit` returned 0 vulnerabilities; XSS protection, rate limiting (`@fastify/rate-limit`), secure HTTP-only cookies. |
| **Two Living Documents Up-to-Date** | Verified | `designing.md` and `connection.md` updated at every milestone. |
