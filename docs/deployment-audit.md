# Pantry Rescue — Deployment Architecture & Scalability Audit

This audit documents every architectural assumption in the Pantry Rescue codebase regarding single-process execution and local disk storage. It evaluates compatibility with a single Render Web Service instance using a persistent disk, and identifies architectural blockers for horizontal scaling beyond one instance.

---

## 1. Summary Matrix

| Component / Subsystem | Code Location | Single Render Instance + Persistent Disk? | Scaling Beyond 1 Instance? | Primary Scaling Blocker & Remediation |
| :--- | :--- | :---: | :---: | :--- |
| **SQLite Database File** | `src/server/db/schema.ts`, `src/server/db/index.ts` | **Compatible** (requires persistent disk mount) | **BLOCKS** | SQLite requires local filesystem locking. Render Disks can only attach to 1 service instance. Multi-instance requires PostgreSQL. |
| **In-Process EventHub** | `src/server/services/events.ts` | **Compatible** (all SSE connections terminate on same process) | **BLOCKS** | In-memory `Map<string, Set<FastifyReply>>` does not propagate across process/container boundaries. Multi-instance requires Redis Pub/Sub or Postgres LISTEN/NOTIFY. |
| **Job Lock & Scheduler** | `src/server/services/scheduler.ts` | **Compatible** (runs within single instance with DB-backed locking) | **BLOCKS** | Relies on single shared SQLite database for `job_locks` table. Without a centralized database, multiple instances execute duplicate jobs. Multi-instance requires centralized Redis/Postgres locks. |
| **Local Cluster Load Balancer** | `src/server/cluster.ts` | **Incompatible for Production** (should not be used on Render) | **BLOCKS** | Designed for local multi-replica testing by spawning child Node processes and reverse-proxying. On Render, Render handles routing and SSL; the app must run `src/server/index.ts` directly. |

---

## 2. In-Depth Component Analysis

### 2.1. The SQLite Database File
- **Code Locations:** [`src/server/db/index.ts`](file:///s:/AutoProj/Proj1/src/server/db/index.ts), [`src/server/db/schema.ts`](file:///s:/AutoProj/Proj1/src/server/db/schema.ts)
- **Current Assumption:**
  The database engine (`better-sqlite3`) opens a file on the local filesystem (`./data/pantry.db` or via `DATABASE_URL=sqlite:///path/to/pantry.db`) in WAL mode (`journal_mode = WAL`).
- **Does it block a single Render instance with a persistent disk?**
  **NO.** Render supports persistent disks mounted to a single Web Service instance (e.g., at `/var/data`). Configuring `DATABASE_URL=sqlite:///var/data/pantry.db` ensures database state, migrations, and audit logs persist across deployments and container restarts.
- **Does it block scaling beyond one instance?**
  **YES.** Render persistent disks are block-storage volumes that can only be mounted to a **single** instance at any given time. If a Render service is scaled to 2 or more instances:
  1. Multiple instances cannot attach to the same persistent disk volume.
  2. If separate volumes were attached, each instance would maintain a separate, out-of-sync SQLite file (split-brain).
  3. SQLite WAL mode cannot operate safely over distributed network filesystems (NFS/CIFS) due to POSIX shared-memory (`.shm`) locking limitations.
- **Remediation for Multi-Instance:**
  Migrate database adapter to managed PostgreSQL (e.g., Render Managed PostgreSQL) where all instances connect to the same connection pool string.

---

### 2.2. In-Process EventHub (Real-Time SSE)
- **Code Locations:** [`src/server/services/events.ts`](file:///s:/AutoProj/Proj1/src/server/services/events.ts), [`src/server/routes/pantry.ts`](file:///s:/AutoProj/Proj1/src/server/routes/pantry.ts#L470)
- **Current Assumption:**
  Active Server-Sent Events (SSE) connections and short-term message replay history are stored in Node.js process memory:
  ```ts
  private subscribers: Map<string, Set<FastifyReply>> = new Map();
  private history: Map<string, HouseholdEvent[]> = new Map();
  ```
- **Does it block a single Render instance with a persistent disk?**
  **NO.** In a single-instance deployment, all household members connect to the same Node.js process. When user A modifies inventory, `eventHub.publish` notifies all subscribers connected to that instance immediately.
- **Does it block scaling beyond one instance?**
  **YES.** If scaled across multiple instances:
  1. Member A might connect to Instance 1, while Member B connects to Instance 2.
  2. When Member A cooks an item on Instance 1, `eventHub.publish` only notifies subscribers connected to Instance 1. Member B on Instance 2 never receives the real-time event.
  3. Polling fallback (`/events/poll`) would hit alternating instances, missing recent events stored only in the other instance's in-memory ring buffer.
- **Remediation for Multi-Instance:**
  Replace in-memory EventHub with Redis Pub/Sub or PostgreSQL `LISTEN` / `NOTIFY`. Each instance subscribes to household channels on Redis, and incoming publish calls broadcast to all instances.

---

### 2.3. Job Lock & Scheduler
- **Code Locations:** [`src/server/services/scheduler.ts`](file:///s:/AutoProj/Proj1/src/server/services/scheduler.ts)
- **Current Assumption:**
  The background scheduler checks quiet hours and dispatches Sir Expiry daily nudges. Concurrency protection uses SQLite table `job_locks`:
  ```sql
  INSERT INTO job_locks (job_name, locked_by, locked_at, expires_at)
  VALUES (?, ?, datetime('now'), datetime('now', '+' || ? || ' seconds'))
  ON CONFLICT(job_name) DO UPDATE ...
  ```
- **Does it block a single Render instance with a persistent disk?**
  **NO.** In a single instance, `acquireJobLock` safely prevents overlapping runs if an asynchronous job execution takes longer than expected or if triggered concurrently.
- **Does it block scaling beyond one instance?**
  **YES (tied to SQLite).** While the locking logic is designed as distributed locking in SQL, it relies on having a single shared database. Because SQLite cannot be shared across multiple Render instances, each instance would possess its own isolated `job_locks` table and run duplicate daily nudge jobs.
- **Remediation for Multi-Instance:**
  With PostgreSQL or Redis (Redlock), this distributed lock works seamlessly across multiple instances. Alternatively, run background tasks as an independent Render Cron Job or dedicated worker service.

---

### 2.4. Local Cluster Orchestrator (`cluster.ts`)
- **Code Locations:** [`src/server/cluster.ts`](file:///s:/AutoProj/Proj1/src/server/cluster.ts)
- **Current Assumption:**
  `cluster.ts` is a custom development orchestrator that spawns child processes for port 3001 and 3002 and acts as an HTTP reverse proxy on port 3000 to simulate load balancing on local machines without Docker.
- **Does it block a single Render instance with a persistent disk?**
  **Must NOT be run on Render.** Render manages the reverse proxy, TLS termination, health probes, and process supervision. Running `cluster.ts` inside a 512MB RAM Render container would consume 3x memory (proxy + 2 replicas) and crash the container with Out-Of-Memory (OOM) errors. The production start command on Render must invoke `src/server/index.ts` directly.
- **Does it block scaling beyond one instance?**
  **YES.** Process-level clustering inside a single container does not scale across multiple physical machines or virtual instances. Render's built-in horizontal autoscaling scales distinct container instances behind Render's native load balancer.
- **Remediation for Production:**
  Use `npm run start:web` (or `node dist/server/index.js` / `tsx src/server/index.ts`) for single-instance Web Service execution.

---

## 3. Render Deployment Strategy Decision

1. **Architecture for Render:**
   - Single Web Service instance (`plan: starter` or free with persistent disk on paid tier).
   - Target start script: single-process Fastify server (`src/server/index.ts`), binding to `0.0.0.0:$PORT`.
   - Single persistent disk mounted at `/var/data` storing `pantry.db` and WAL files.
   - Serve static PWA assets from `./dist` directly via Fastify static plugin.
2. **Explicit Scalability Guard:**
   - Single-instance mode is documented in `designing.md` as an intentional architectural decision to keep deployment costs at minimum ($0 on free tier without persistence, or $7/mo Starter with persistent disk for data durability) with zero external service dependencies.
