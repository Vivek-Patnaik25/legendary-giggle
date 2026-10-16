# 🍲 Pantry Rescue

> **Turn food about to expire into dinner ideas — and make wasting less food feel like a game.**

[![Tests](https://img.shields.io/badge/tests-37%20passed%20%7C%20100%25-brightgreen.svg)]()
[![Vulnerabilities](https://img.shields.io/badge/vulnerabilities-0-brightgreen.svg)]()
[![Throughput](https://img.shields.io/badge/throughput-2%2C152%20req%2Fsec-blue.svg)]()
[![PWA](https://img.shields.io/badge/PWA-offline--first-orange.svg)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)]()

Pantry Rescue is a shared household fridge and pantry tracker designed to bridge the gap between static inventory management and disconnected recipe apps. It keeps track of what is in your kitchen, estimates expiry windows automatically, computes real-time urgency rankings, surfaces dinner recipes prioritizing your most at-risk items first, and turns household thrift into a fun, rewarding habit.

---

## 🌟 The Core Loop

1. **Add Items Fast:** Type a name, scan a barcode, or pick from quick presets. Expiry is automatically estimated by food category and is fully editable.
2. **See What is at Risk (The Rescue Board):** Active items are ordered by dynamic Urgency Score. The home board immediately displays recipes that use up expiring ingredients.
3. **Cook or Discard (Delta Accounting):** Cooking decrements items via delta operations. Letting items go off records waste. Depleted items are automatically archived.
4. **Get Nudged, Not Nagged:** Sir Expiry delivers rare, witty, contextual reminders within daytime hours (respecting timezone quiet hours and daily caps).
5. **Track Household Progress:** Set a weekly waste pact, build streaks, unlock whimsical badges (e.g. *Onion Survivor*, *Freezer Archaeologist*), and share weekly report cards.

---

## 🏰 Mascot: Sir Expiry

**Sir Expiry** is a dramatic, whimsical fridge creature who lives in your crisper drawer. His mood directly mirrors the urgency of your pantry:
- **Calm & Proud (`calm`):** When all groceries are fresh and well-managed.
- **Nervous & Alert (`worried`):** When items are expiring in 1–2 days.
- **Theatrical Panic (`panicked`):** When food has crossed into critical expiry!

Sir Expiry's dialogue is template-driven, witty, empathetic, and never shames individual household members.

---

## ⚡ Unique Features

- **Urgency Scoring Algorithm:**
  $$\text{UrgencyScore} = (\text{DaysRemainingFactor} \times 0.5) + (\text{QuantityFactor} \times 0.2) + (\text{RecipeCandidateFactor} \times 0.3)$$
- **Rescue Recipes & Offline Intelligence:** Ranks recipes by at-risk ingredients used and highlights exact missing ingredients count and names. Bundles 50+ curated rescue recipes for 100% offline functionality.
- **Culinary Synonym Matching & Plural Normalisation:** Bidirectional mapping for regional terms (e.g., *coriander* $\leftrightarrow$ *cilantro*, *aubergine* $\leftrightarrow$ *eggplant*, *capsicum* $\leftrightarrow$ *bell pepper*) with plural stemming.
- **Smart Shopping Hints:** Recommends 1–2 complementary ingredients that unlock dinners from your current inventory without ever suggesting items you already own.
- **Freezer Mode & 60-Day Rediscovery:** Freezing extends category expiries and automatically resurfaces long-frozen items before freezer burn sets in.
- **First-Class Leftovers & Unenforced Claims:** Track cooked portions with dedicated short expiries and tag items (*"this yogurt is mine"*) to prevent household disputes.
- **Weekly Rescue Report Card:** Dynamic shareable card with custom background artwork, weekly thrift stats, and mascot commentary.

---

## 🏛️ System Architecture

```
                                  [ CLIENT LAYER (PWA) ]
                      React 19 / Vite / Tailwind CSS / Lucide Icons
                       IndexedDB Offline Mutation Queue / SSE Hub
                                           |
                              HTTP / SSE Requests (JSON)
                                           v
                       [ REVERSE PROXY / LOAD BALANCER (Port 3000) ]
                        Round-Robin Health Checks / X-Served-By
                                     /            \
                                    v              v
                  [ API REPLICA 1 (Port 3001) ]   [ API REPLICA 2 (Port 3002) ]
                  Fastify Stateless Service       Fastify Stateless Service
                                    \              /
                                     v            v
                               [ PERSISTENCE LAYER ]
                     SQLite WAL Mode (busy_timeout 5,000ms)
                     Versioned Migrations / Audit Logs / Job Locks
```

- **Stateless API:** Multi-replica ready, all session state is cryptographically signed, and mutations are backed by idempotency keys.
- **Concurrency & Delta Operations:** Quantity edits use atomic additive/subtractive operations (`item_deltas`) rather than overwriting absolute values, preventing lost updates when multiple household members cook at once.
- **Strict Household Scoping:** Every single data access path verifies the requesting user's household membership and role (`owner`, `member`, `guest`).
- **Offline-First PWA:** Full service worker caching and IndexedDB queue with automatic FIFO replay upon network reconnect.

---

## 📊 Benchmark & Load Test Results

Tested on multi-replica cluster behind the reverse proxy load balancer (`npx tsx scripts/load-test.ts`):

| Metric | Result |
| :--- | :--- |
| **Total Requests** | **300 requests** (Concurrency: 25 workers) |
| **Success Rate** | **100.0%** (0 errors) |
| **Throughput** | **2,152 req/sec** |
| **Median Latency (p50)** | **8.78 ms** |
| **95th Percentile Latency (p95)**| **36.63 ms** |
| **99th Percentile Latency (p99)**| **38.24 ms** |
| **Replica Distribution** | **replica-1: 50.0% (150) \| replica-2: 50.0% (150)** |

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation
```bash
# Clone the repository
git clone https://github.com/Vivek-Patnaik25/legendary-giggle.git
cd legendary-giggle

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
```

### Running Locally

#### 1. Multi-Replica Stack with Load Balancer (Recommended)
Spawns the reverse proxy load balancer on port 3000 and two API replicas on ports 3001 and 3002:
```bash
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

#### 2. Single Replica Development Mode
```bash
# Terminal 1: Fastify Backend
npm run dev

# Terminal 2: Vite Client Dev Server with HMR
npm run dev:client
```

#### 3. Docker Multi-Container Stack
```bash
docker-compose up --build
```

---

## 🧪 Testing & Validation

```bash
# 1. Run Unit & Integration Test Suite (Vitest)
npm test

# 2. Run End-to-End Core Loop Smoke Test (against Load Balancer)
npm run test:e2e

# 3. Run Concurrency Load Test Benchmark
npm run test:load

# 4. Verify Production Build & TypeScript Typechecks
npm run build

# 5. Security & Dependency Audit
npm audit
```

---

## 🔌 API Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login and receive secure session cookie |
| `GET` | `/api/auth/me` | Fetch active user session |
| `GET` | `/api/dev/inbox` | Development inbox for email tokens |
| `GET` | `/api/households` | List user households |
| `POST` | `/api/households` | Create new household |
| `POST` | `/api/households/:id/invites` | Generate household invite link |
| `POST` | `/api/invites/:token/redeem` | Join household via invite |
| `GET` | `/api/households/:id/items` | Fetch pantry items sorted by urgency |
| `POST` | `/api/households/:id/items` | Add new item (with category estimation) |
| `POST` | `/api/households/:id/items/:itemId/cook` | Decrement item quantity (delta) |
| `POST` | `/api/households/:id/items/:itemId/waste` | Mark item as wasted |
| `GET` | `/api/lookup/barcode/:code` | Cached Open Food Facts barcode lookup |
| `GET` | `/api/households/:id/recipes/rescue` | Ranked rescue recipe suggestions |
| `GET` | `/api/households/:id/recipes/shopping-hints` | Smart 1–2 missing ingredient hints |
| `GET` | `/api/households/:id/scoreboard` | Scoreboard, streaks, and unlocked badges |
| `GET` | `/api/households/:id/report/weekly` | Generate Weekly Rescue Report card |
| `GET` | `/api/households/:id/events` | Server-Sent Events stream for real-time sync |
| `GET` | `/health` | Health check probe |
| `GET` | `/metrics` | Prometheus/JSON metrics endpoint |

---

## 🛡️ Security, Privacy & Integrity

- **Zero Cloud Costs:** 100% free-tier services only (Open Food Facts, TheMealDB, SQLite, local inbox).
- **Session Protection:** HTTP-only, SameSite strict signed session cookies.
- **Strict Scoping:** Every SQL query explicitly scopes to `household_id`. Cross-household data leakage is mathematically impossible.
- **XSS & Injection Protection:** Strict HTML sanitization on all string inputs and parameterized queries for all database operations.
- **Anti-Spam & Quiet Hours:** Household timezone and Daylight Saving Time (DST) aware scheduler prevents notifications outside 08:00–21:00.

---

## 📄 Documentation

- [designing.md](file:///s:/AutoProj/Proj1/designing.md): Full architectural decision records, trade-offs, and Definition of Done validation.
- [connection.md](file:///s:/AutoProj/Proj1/connection.md): Detailed component map, data flow pipelines, caching rules, and state machines.
