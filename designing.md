# Pantry Rescue — Design & Decisions Log (designing.md)

This living document records the milestone roadmap, every major architectural and design decision, alternatives rejected, trade-offs accepted, load test results, known gaps, and the final Definition of Done checklist with concrete command and test proofs.

---

## 1. Milestone Roadmap

- [x] **Milestone 0: Project Setup & Repository Initialization**
  - Git repository initialization, remote tracking `https://github.com/Vivek-Patnaik25/legendary-giggle.git`.
  - Comprehensive `.gitignore` protecting secrets, local databases, build outputs, and `node_modules` (anchored `/data/` to root).
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
  - Dev inbox (`/api/dev/inbox` and `/api/auth/dev/inbox`) for email-free token review.
  - Multi-household membership with strict RBAC (owner, member, guest).
  - Strict household scoping enforced on every single query path.
  - Invites with expiry and revocation.
  - Idempotent writes via `Idempotency-Key` header with replay cache.
  - Operation-based quantity deltas for concurrent updates; last-writer-wins for metadata with audit logging.
  - Soft deletion with active item waste attribution.
  - Real-time updates via Server-Sent Events (SSE) with polling fallback.
  - Comprehensive API integration tests passing.

- [x] **Milestone 4: Barcode Lookup, Recipe Intelligence & Offline Fallback**
  - Open Food Facts barcode lookup with caching and descriptive User-Agent.
  - TheMealDB recipe search integration + robust bundled offline recipe dataset (`src/server/data/offlineRecipes.ts`).
  - Recipe ranking algorithm (at-risk items prioritized, missing ingredients count and list).
  - Smart shopping hints engine (1-2 missing items, excluding current inventory).
  - Leftovers as first-class items.
  - Unenforced item claims ("this yogurt is mine").
  - Comprehensive integration tests passing.

- [x] **Milestone 5: Gamification, Scoreboard & Weekly Rescue Report**
  - Household pact: weekly waste targets.
  - Scoreboard tracking used vs wasted items (deleting active items counts as waste unless consumed).
  - Badge unlock engine (Onion Survivor, Freezer Archaeologist, Scrappy Chef, Pact Keeper, Crisper Hero).
  - Tamper-proof score audit log and real-time badge unlock events.
  - Weekly Rescue Report generator with visual card rendering and Sir Expiry commentary.
  - Comprehensive integration tests passing.

- [x] **Milestone 6: Background Jobs, Nudges & Observability**
  - Database-backed distributed job lock for multi-replica execution.
  - Daily Rescue Board calculation and nudge scheduler.
  - Anti-spam rules: quiet hours by timezone (DST aware), daily cap, filtering out resolved items.
  - Health (`/health`) and metrics (`/metrics`) endpoints.
  - Comprehensive integration tests passing.

- [x] **Milestone 7: Frontend PWA, UI/UX, Offline Sync & Dark Mode**
  - React + Vite + Tailwind CSS + Lucide Icons installable PWA.
  - Offline-first IndexedDB storage and background sync queue with conflict resolution.
  - Responsive, keyboard-accessible, screen-reader-labelled, dark mode by default.
  - Onboarding with Sir Expiry (no blank screens).
  - Full core loop UI: Rescue Board, Quick Add, Cook/Discard modals, Recipes, Scoreboard, Settings, and Dev Inbox.
  - Production build compiled with zero errors.

- [x] **Milestone 8: Multi-Replica Stack, Load Balancer & E2E Verification**
  - Reverse proxy / load balancer with health checks routing across 2+ API replicas (`src/server/cluster.ts`).
  - Production container configuration (`Dockerfile`, `docker-compose.yml`, `nginx.conf`).
  - `X-Served-By` replica header injection and verification.
  - Full core-loop smoke test script (`scripts/smoke-test.ts` passing 10/10 steps).
  - Load test benchmarking concurrency and latency (`scripts/load-test.ts` passing with 2,152 req/sec).

- [x] **Milestone 9: Security Audit, Accessibility Check, Polish & Final Documentation**
  - Security audit completed: `npm audit` returned 0 vulnerabilities.
  - Full test suite verified: 41 Vitest unit & integration tests passing 100%.
  - Cross-household IDOR test and distributed job lock race test (`tests/server/security.test.ts`).
  - Concurrent offline delta sync and replay protection test (`tests/server/concurrent.test.ts`).
  - Production build verified: `npm run build` succeeds cleanly.
  - Complete `README.md` created with architecture, local setup, containerization, and testing instructions.
  - Definition of Done verified with concrete command proofs and gap notes.

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
- **Decision:** Quantity changes are recorded as atomic delta operations (`quantity_deltas` / `item_deltas`) rather than overwriting absolute values. Metadata fields (name, notes, claim, expiry) use last-writer-wins with revision timestamps.
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
- **Decision:** Hybrid recipe engine: TheMealDB free API integration with local disk cache + bundled rich offline recipe database (50+ curated pantry recipes in `src/server/data/offlineRecipes.ts`).
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

### Decision 008: Deliberate Single-Instance Render Deployment with SQLite Persistent Disk
- **Decision:** Deploy Pantry Rescue to Render as a single web service instance (`numInstances: 1`) using a persistent disk mount (at `/var/data`) for SQLite storage (`DATABASE_URL=sqlite:///var/data/pantry.db`) on paid Starter tier, or `./data/pantry.db` on Free tier.
- **Why:** Deliberate decision to keep hosting operational simplicity high and costs low while maintaining data durability across deploys and container recycles. It fulfills all product guarantees without requiring an external paid database. Because block storage persistent disks can only be mounted to a single instance, horizontal scaling is deliberately constrained to 1 instance.
- **Alternatives Rejected:**
  - *PostgreSQL requirement for initial deployment:* Adds deployment complexity and extra service costs for small households.
- **Trade-offs:** Constrains Render service to 1 instance. Horizontal scaling beyond 1 instance requires migrating to PostgreSQL and Redis, as fully documented in `docs/deployment-audit.md`.

### Decision 009: Node.js Runtime Pinning (Node 22 LTS)
- **Decision:** Pin Node.js runtime strictly to Active LTS (`22.14.0`) across `.node-version`, `.nvmrc`, `package.json` (`"engines": { "node": ">=20.0.0 <23.0.0" }`), and `render.yaml` (`NODE_VERSION: 22.14.0`).
- **Why:** Render defaults to bleeding-edge Node 24.21.0 on newly created services. Node 24 modified V8 environment cleanup hooks, causing native addon `better-sqlite3` to trigger a core dump abort (`Assertion failed: (env) != nullptr in node::RemoveEnvironmentCleanupHook`). Pinning to Node 22 LTS completely resolves this native crash.

### Decision 010: Render Free Tier Compatibility & Database Evaluation
- **Decision:** Provide out-of-the-box support for the Render Free Tier ($0/month) with local SQLite (`./data/pantry.db`) and automatic fallback if unwritable paths (like `/var/data`) are specified without a mounted disk.
- **Evaluation on MongoDB vs Relational:**
  - *MongoDB Rejected:* Pantry Rescue requires relational data integrity: foreign keys (`household_id`, `user_id`), atomic delta operations (`item_deltas`) to eliminate lost-update concurrency races, versioned SQL migrations (`schema_migrations`), and audit logging. Rewriting to MongoDB would forfeit transactional safety and require discarding all 41 validated unit and integration tests.
  - *Free Cloud Persistence Recommendation:* For households wanting $0 permanent persistence across Render free-tier spin-downs, the recommended path is **Turso (libSQL)** — which provides 9 GB free cloud SQLite using identical SQL syntax — or **Supabase / Neon (Serverless PostgreSQL)**.

---

## 3. Load Test Results & Known Gaps

### Concurrency Benchmark
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
Total Elapsed Time:  0.13s - 0.14s
Throughput:          2,152 - 2,396 req/sec

Latency Percentiles:
  Min:               4.38 ms
  Median (p50):      7.84 - 8.78 ms
  p95:               33.70 - 36.63 ms
  p99:               38.18 - 38.24 ms
  Max:               38.73 - 38.80 ms

Replica Distribution (Proof of Load Balancing):
  replica-2: 150 requests (50.0%)
  replica-1: 150 requests (50.0%)
-------------------------
```

### Raw Load Balancer Round-Robin Proof (`scripts/verify-replicas.ts`)
```
Request #1:
  HTTP/1.1 200 OK
  x-served-by: replica-1
  x-request-id: req-1792238153371-oh93

Request #2:
  HTTP/1.1 200 OK
  x-served-by: replica-2
  x-request-id: req-1792238153393-y6e2

Request #3:
  HTTP/1.1 200 OK
  x-served-by: replica-1
  x-request-id: req-1792238153399-a7oi

Request #4:
  HTTP/1.1 200 OK
  x-served-by: replica-2
  x-request-id: req-1792238153404-mbon
```

### Known Gap: Docker Desktop Daemon Inactive on Host
- **Status:** **NOT VERIFIED (Docker Engine)**
- **Observation:** Running `docker compose up --build` or `docker ps` outputs:
  `unable to get image ... error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/...": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.`
- **Explanation:** Docker Desktop CLI is installed, but the Linux VM / WSL daemon is not active on this specific Windows host.
- **Mitigation & Alternative Proof:** The multi-replica architecture is validated locally via `src/server/cluster.ts` (reverse proxy load balancer balancing ports 3001 and 3002 with `X-Served-By` verification and health checks). All Docker configuration files (`Dockerfile`, `docker-compose.yml`, `nginx.conf`) are fully written, syntax-checked, and ready for deployment once the Docker daemon is enabled.

---

## 4. Final Definition of Done Checklist

| Requirement | Status | Concrete Command / Test Proof |
| :--- | :---: | :--- |
| **Zero Paid Services** | **VERIFIED** | `vitest run tests/server/api.test.ts` (dev inbox test), `vitest run tests/server/recipes.test.ts` (offline fallback test) |
| **Fast & Responsive** | **VERIFIED** | `npm run test:load` (2,152 req/sec, p50 8.78ms), `npm run build` (dist bundle 96kB gzip) |
| **Safe Under Concurrency** | **VERIFIED** | `vitest run tests/server/concurrent.test.ts` (`both offline clients' cooking deltas survive after sync`) |
| **Stateless Multi-Replica API** | **VERIFIED** | `npx tsx scripts/verify-replicas.ts` & `npm run test:load` (300 requests split 50% replica-1 / 50% replica-2) |
| **Load Balancer with Health Checks** | **VERIFIED** | `npx tsx scripts/verify-replicas.ts` (verified sequential `x-served-by` alternating replica-1 / replica-2), `npm run test:e2e` (Step 1) |
| **Graceful Shutdown** | **VERIFIED** | `npx tsx scripts/verify-replicas.ts` (SIGTERM trap shuts down child replica processes cleanly) |
| **Relational DB with Migrations** | **VERIFIED** | `src/server/db/schema.ts` (4 migrations), `vitest run tests/server/api.test.ts` |
| **Audit Logging & Soft Deletion** | **VERIFIED** | `vitest run tests/server/api.test.ts` (`records cooking rescues and counts active deletion as waste in audit scoreboard`) |
| **Household Scoping on Every Query (IDOR Guard)** | **VERIFIED** | `vitest run tests/server/security.test.ts` (`blocks a valid session from reading or modifying a different household's items (IDOR guard)`) |
| **Distributed Scheduler Job Locking** | **VERIFIED** | `vitest run tests/server/security.test.ts` (`ensures distributed job lock: only one of two concurrent runners acquires the lock`) |
| **Idempotent Writes & Replay Protection** | **VERIFIED** | `vitest run tests/server/concurrent.test.ts` (`replay of either request does not double-count`) & `vitest run tests/server/api.test.ts` (`guarantees idempotency on network retries without duplicating items`) |
| **Unit Normalisation & Nonsense Rejection** | **VERIFIED** | `vitest run tests/domain/units.test.ts` (6 passing tests) |
| **Synonym Canonicalization & Plural Stemming** | **VERIFIED** | `vitest run tests/domain/synonyms.test.ts` (3 passing tests) |
| **Urgency Score Formula** | **VERIFIED** | `vitest run tests/domain/urgency.test.ts` (7 passing tests) |
| **Expiry Estimation & Freezer Extension** | **VERIFIED** | `vitest run tests/domain/expiry.test.ts` (3 passing tests) |
| **Rescue Recipes & Offline Fallback** | **VERIFIED** | `vitest run tests/server/recipes.test.ts` (4 passing tests) |
| **Smart Shopping Hints** | **VERIFIED** | `vitest run tests/server/recipes.test.ts` (`generates smart shopping hints`) & `npm run test:e2e` (Step 9) |
| **Leftovers & Claims** | **VERIFIED** | `vitest run tests/server/recipes.test.ts` (`supports leftovers as first-class items and unenforced claims`) |
| **Household Pact & Scoreboard** | **VERIFIED** | `vitest run tests/server/gamification.test.ts` (3 passing tests) |
| **Weekly Rescue Report Card** | **VERIFIED** | `vitest run tests/server/gamification.test.ts` (`generates weekly rescue report card`) & `npm run test:e2e` (Step 10) |
| **Mascot Personality Engine** | **VERIFIED** | `vitest run tests/domain/mascot.test.ts` (3 passing tests) |
| **Background Jobs & Anti-Spam** | **VERIFIED** | `vitest run tests/server/scheduler.test.ts` (3 passing tests) |
| **Installable PWA & Offline Sync** | **VERIFIED** | `npm run build` (builds `dist/`), `public/sw.js`, `public/manifest.json` |
| **Container Execution (`docker compose`)** | **NOT VERIFIED** | Host gap: Docker Desktop daemon not active on Windows host (`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`). Configs present in `Dockerfile`, `docker-compose.yml`, `nginx.conf`. |
| **Security & Vulnerability Free** | **VERIFIED** | `npm audit` (0 vulnerabilities) |
| **Complete End-to-End Core Loop** | **VERIFIED** | `npm run test:e2e` (10/10 steps passed against reverse proxy load balancer) |
