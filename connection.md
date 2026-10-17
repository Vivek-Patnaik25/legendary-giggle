# Pantry Rescue — System Architecture & Connection Map (connection.md)

This living document describes how all components of Pantry Rescue fit together: modules, functions, data flows, state machines, background tasks, edge cases, and caching rules.

---

## 1. High-Level Architecture Overview

```
+---------------------------------------------------------------------------------+
|                                CLIENT LAYER (PWA)                               |
|  - React 19 / Vite / Tailwind CSS / Lucide Icons                                |
|  - Service Worker (Offline Cache, Asset Cache)                                  |
|  - IndexedDB (Offline Inventory Store & Mutation Queue)                         |
|  - Real-Time SSE Listener with Polling Fallback                                 |
+---------------------------------------------------------------------------------+
                                       |
                   HTTP / SSE Requests (JSON, X-Request-Id)
                                       v
+---------------------------------------------------------------------------------+
|                       LOAD BALANCER / REVERSE PROXY                             |
|  - Multi-Replica Routing (Round-Robin with Health Checks)                       |
|  - Injects X-Served-By: replica-N, X-Request-Id headers                         |
+---------------------------------------------------------------------------------+
                         /                           \
                        v                             v
+-------------------------------+             +-------------------------------+
|       API REPLICA 1 (Node)    |             |       API REPLICA 2 (Node)    |
|  Fastify Stateless Service    |             |  Fastify Stateless Service    |
|  Port: 3001                   |             |  Port: 3002                   |
+-------------------------------+             +-------------------------------+
                        \                             /
                         \                           /
                          v                         v
+---------------------------------------------------------------------------------+
|                            DATA & PERSISTENCE LAYER                             |
|  - Relational Database (SQLite WAL mode with busy_timeout / PostgreSQL)        |
|  - Tables: users, households, members, invites, items, item_deltas,             |
|            recipes, cache_entries, scoreboard_events, badges, audit_logs        |
|  - Distributed DB Job Locking for Multi-Replica Background Tasks                |
+---------------------------------------------------------------------------------+
```

---

## 2. Component Responsibilities

| Component | Responsibility |
| :--- | :--- |
| `src/server/index.ts` | Server bootstrap, plugin registration, multi-replica binding, graceful shutdown. |
| `src/server/routes/auth.ts` | User registration, password hashing (scrypt/bcrypt), cookie sessions, dev inbox. |
| `src/server/routes/households.ts`| Household creation, membership management, RBAC enforcement, invites. |
| `src/server/routes/pantry.ts` | Item CRUD, delta-based quantity updates, urgency sorting, claims, and SSE real-time stream (`/:id/events`). |
| `src/server/routes/recipes.ts` | Recipe suggestions, ingredient matching, missing ingredients calculation. |
| `src/server/routes/scoreboard.ts`| Waste/rescue logging, streak calculations, badge awards, audit logs. |
| `src/server/services/events.ts` | In-memory pub/sub EventHub broadcasting item mutations, score changes, and polling fallback. |
| `src/server/utils/sanitize.ts` | HTML sanitization for XSS prevention preserving UTF-8, RTL, and emojis. |
| `src/server/services/barcode.ts`| Open Food Facts lookup, cache manager, offline product fallback. |
| `src/server/services/recipeEngine.ts` | TheMealDB search, offline recipes fallback, urgency-weighted ranking. |
| `src/server/services/scheduler.ts`| Distributed background job runner, daily Rescue Board, nudge dispatch. |
| `src/domain/urgency.ts` | Pure urgency score calculation algorithm (days left, quantity, recipe count). |
| `src/domain/units.ts` | Unit normalisation table, conversions, and invalid conversion detection. |
| `src/domain/synonyms.ts` | Multi-language / regional ingredient synonym canonicalizer. |
| `src/domain/mascot.ts` | Sir Expiry mascot personality engine, mood states, and contextual quotes. |
| `src/client/` | React Single Page Application (PWA) with offline capabilities. |

---

## 3. End-to-End Data Flows

### Flow 1: Adding an Item via Barcode
1. **User Action:** User scans barcode or enters UPC in client UI (`src/client/components/AddItemModal.tsx`).
2. **Client Request:** `GET /api/lookup/barcode/:code` with session cookie and `X-Request-Id`.
3. **Lookup Service (`src/server/services/barcode.ts`):**
   - Checks local cache table `cache_entries` for key `barcode:<code`.
   - If cache hit: returns cached product payload immediately.
   - If cache miss: queries Open Food Facts API (`https://world.openfoodfacts.org/api/v2/product/<code.json`) with custom `User-Agent`.
   - On success: normalizes product name and category, saves to cache table with TTL (86,400s), and returns to client.
   - On external API failure or product not found: returns 404 with structured error inviting manual entry.
4. **Item Persistence:** User confirms/adjusts quantity, unit, and estimated expiry.
   - Client sends `POST /api/households/:id/items` with payload and `Idempotency-Key`.
   - API verifies household membership and active role.
   - API applies category expiry defaults if expiry date is blank.
   - Database creates item record and initial positive `quantity_delta` in a single transaction.
   - Audit log entry recorded.
5. **Real-Time Notification:**
   - Household event channel broadcasts `ITEM_ADDED` event with updated item details to all connected SSE clients.

### Flow 2: Cooking a Recipe & Recording Deltas
1. **User Action:** User clicks "Cook Dinner" on a recipe card.
2. **Client Request:** `POST /api/households/:id/cook` with recipe ID, list of items and used portions, and `Idempotency-Key`.
3. **Atomic Processing:**
   - For each ingredient, an `item_deltas` record is created with a negative quantity (`-usedAmount`).
   - If item quantity reaches zero, item status updates to `consumed`.
   - Scoreboard audit record logged: marks food as "rescued" (waste prevented).
   - Household streak and weekly target evaluated.
   - If criteria met, badges (e.g. "Onion Survivor", "Scrappy Chef") unlocked.
4. **Smart Shopping Suggestion:**
   - Engine identifies 1-2 complementary ingredients for related recipes that are absent from household pantry.
   - Returns smart shopping hints in response payload.
5. **Broadcast:** SSE event `PANTRY_UPDATED` pushed to all household members.

---

## 4. State Transitions

### Item Lifecycle
```
[Created (Active)] ---> [Freezer Mode] (Extends expiry date per category)
        |                      |
        +--------+-------------+
                 |
                 +---> [Used / Decremented] (Quantity reduced via delta)
                 |          |
                 |          +---> (Quantity == 0) ---> [Consumed (Rescued)]
                 |
                 +---> [Marked Waste] ------------> [Wasted]
                 |
                 +---> [Soft Deleted] ------------> [Wasted (unless marked consumed)]
```

### Invite Lifecycle
```
[Generated (Pending)] ---> [Redeemed by User] ---> [Active Household Member]
        |
        +---> [Revoked by Owner] -----------------> [Revoked / Inactive]
        |
        +---> [Expired (TTL > 7 days)] -----------> [Expired]
```

---

## 5. Edge Case Handling Matrix

| Edge Case | Where Handled | Resolution Strategy |
| :--- | :--- | :--- |
| Incompatible units (e.g. grams to cups for unknown density) | `src/domain/units.ts` | Returns rejection error with clear, helpful conversion guidance. |
| Negative or decimal quantities | `src/domain/units.ts` & `src/server/routes/pantry.ts` | Validates decimals down to 2 places; rejects negative baseline; logs delta if cooking consumes more. |
| Clock skew on offline devices | `src/server/routes/pantry.ts` & `src/client/sync.ts` | Uses pure ISO calendar dates (`YYYY-MM-DD`) for expiry rather than local device timestamps; writes are idempotent. |
| Concurrent item edits | `src/server/routes/pantry.ts` | Quantity uses atomic delta operations (`item_deltas`); metadata uses last-writer-wins with audit trails. |
| Member revoked while offline | `src/server/middleware/auth.ts` | Checked at query boundary; next sync attempt receives 403 `MEMBER_REVOKED`; client purges local household cache. |
| Household deleted during sync | `src/server/routes/pantry.ts` | Responds with 410 `HOUSEHOLD_DELETED`; client notifies user and clears offline storage gracefully. |
| External recipe API down | `src/server/services/recipeEngine.ts` | Gracefully falls back to bundled offline recipe dataset with `source: 'bundled_offline'`. |
| XSS / Script injection in item name | `src/server/utils/sanitize.ts` & React JSX | Input sanitized, strictly HTML-escaped at boundary and rendered safely via React. |
| Spam notifications & quiet hours | `src/server/services/scheduler.ts` | Checks household timezone + DST; suppresses notifications between 21:00 and 08:00 local time; caps at 1/day. |

---

## 6. Caching Rules & Invalidation

| Cache Key | Storage | TTL | Invalidation Trigger |
| :--- | :--- | :--- | :--- |
| `barcode:<code` | SQLite `cache_entries` | 86,400s (24 hours) | Automatic TTL expiry; manual refresh if product data updated. |
| `recipes:search:<query>` | SQLite `cache_entries` | 86,400s (24 hours) | Daily background refresh or on demand. |
| `household:rescue:<id>` | In-memory / short DB cache | 300s (5 minutes) | Invalidated immediately on any item addition, delta, or deletion. |

---

## 7. Multi-Replica Cluster & Reverse Proxy Setup

Pantry Rescue is designed to run locally with zero cloud dependencies while mirroring enterprise multi-replica production:

1. **Local Node Cluster (`src/server/cluster.ts`):**
   - Reverse proxy listening on port 3000.
   - Spawns two child API replica instances on port 3001 (`replica-1`) and 3002 (`replica-2`).
   - Polls `/health` on all replicas every 2,000ms.
   - Routes incoming requests using round-robin distribution across healthy replicas.
   - Injects `X-Served-By` (`replica-1`, `replica-2`) and ensures `X-Request-Id` is propagated on all downstream responses.
   - Performs graceful shutdown on `SIGINT` / `SIGTERM`, draining in-flight requests and terminating child processes cleanly.

2. **Docker Multi-Container Deployment (`docker-compose.yml` & `nginx.conf`):**
   - Nginx reverse proxy listening on port 3000 as `pantry-load-balancer`.
   - Replicas `pantry-api-1` and `pantry-api-2` running production Alpine Node images.
   - Shared persistent volume `pantry-data` mounted at `/data` for SQLite WAL database.
   - Full SSE support enabled via Nginx (`proxy_buffering off; chunked_transfer_encoding off;`).

---

## 8. Client Offline Sync & Conflict Resolution

```
[User Action in Offline Mode]
             |
             v
[Write to Local IndexedDB ('pending_mutations')]
             |
             v
[Optimistic Local UI Update]
             |
             v
[Online Event Detected (window 'online' / periodic heartbeat)]
             |
             v
[Process FIFO Mutation Queue]
             |
             +---> Send POST/PUT with 'Idempotency-Key'
             |          |
             |          +---> (200/201 OK) ---> Remove from queue & apply server state
             |          |
             |          +---> (403 Forbidden: Revoked) ---> Wipe local household cache & prompt re-login
             |          |
             |          +---> (410 Gone: Household Deleted) ---> Drop household items & notify user
             |          |
             |          +---> (Network Failure) ---> Exponential backoff & keep in queue
             |
             v
[Household In-Sync with Backend]
```

