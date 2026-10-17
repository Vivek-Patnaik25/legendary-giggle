# 🚀 Deploying Pantry Rescue to Render (100% Free Tier Supported)

This step-by-step guide explains how to deploy **Pantry Rescue** to [Render](https://render.com) as a unified production Web Service hosting both the Fastify backend API and the installable React PWA frontend.

---

## 💰 100% Free Tier ($0/month) vs. Paid Starter

Pantry Rescue is designed to run **completely free ($0/month)** on Render's Free tier:

| Plan | Monthly Cost | Storage Type | Data Persistence Behavior |
| :--- | :---: | :--- | :--- |
| **Render Free Tier** *(Default)* | **$0 / mo** | Ephemeral local disk (`./data/pantry.db`) | Data persists while the container is running. If Render spins down after 15 min of inactivity or redeploys, data resets. Ideal for testing, personal use, or zero-cost hosting. |
| **Free Cloud SQLite (Turso / libSQL)** | **$0 / mo** | Cloud-replicated SQLite | **Permanent persistence** across all redeploys and restarts with zero monthly bill (9 GB free tier, no credit card required). |
| **Render Starter + Disk** | **~$7.25 / mo** | Block storage persistent disk (`/var/data/pantry.db`) | Permanent persistence on Render without any external cloud database. Requires Render Starter plan ($7) + 1 GB disk ($0.25). |

> [!TIP]
> **Zero Cost:** The included `render.yaml` defaults to **Plan: Free** and **zero extra costs**. You do not need to enter a credit card or pay $7/month!

---

## ⚠️ Important Note: Node.js 22 LTS Runtime (Fix for Node 24 Crash)

If you saw the following error in your Render deploy logs:
```
node[82]: void node::RemoveEnvironmentCleanupHook(v8::Isolate*, CleanupHook, void*) at ../src/api/hooks.cc:142
Assertion failed: (env) != nullptr
Statement::~Statement() better_sqlite3.node
Aborted (core dumped) / exit status 134
```

### Why it happened
Render recently defaulted new web services to **Node.js 24.21.0**. Node 24 introduced changes to internal V8 isolate cleanup hooks that cause native C++ modules (such as `better-sqlite3`) to fail an upstream assertion on exit or cleanup.

### The Fix
This repository now enforces **Node.js 22 LTS (`22.14.0`)** via:
1. `.node-version` (`22.14.0`)
2. `.nvmrc` (`22.14.0`)
3. `package.json` (`"engines": { "node": ">=20.0.0 <23.0.0" }`)
4. `render.yaml` (`NODE_VERSION: 22.14.0`)

Render will automatically detect Node 22 and compile cleanly without this crash.

---

## 🛠️ Deployment Method 1: Blueprint Deploy (Recommended / Easiest)

Because this repository includes a [`render.yaml`](render.yaml) file configured for the **Free Tier**, Render can configure everything automatically:

1. Log into your account at [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** (top right) $\rightarrow$ **Blueprint**.
3. Connect your GitHub repository (`legendary-giggle`).
4. Render will read `render.yaml` and configure:
   - **Service Name:** `pantry-rescue`
   - **Plan:** `Free` ($0/mo)
   - **Runtime:** `Node` (pinned to `22.14.0`)
   - **Build Command:** `npm run build`
   - **Start Command:** `npm run start:web`
   - **Health Check Path:** `/health`
   - **Environment Variables:** `NODE_VERSION`, `NODE_ENV`, `HOST`, `DATABASE_URL`, `COOKIE_SECURE`, and an auto-generated `SESSION_SECRET`.
5. Click **Apply**. Render will install, build the client and server, and start the application.

---

## 📋 Deployment Method 2: Manual Web Service Setup (Free Tier)

Follow these manual steps if you prefer creating the Web Service via the Render Dashboard UI:

### Step 1: Create a New Web Service
1. In the Render Dashboard, click **New +** $\rightarrow$ **Web Service**.
2. Under "Connect a repository", select your `legendary-giggle` repo.

### Step 2: Configure Service Details
Fill in the fields on the creation screen:

| Field | Value | Notes |
| :--- | :--- | :--- |
| **Name** | `pantry-rescue` | This forms part of your URL (`pantry-rescue.onrender.com`). |
| **Region** | Choose closest to you (e.g. `Oregon (US West)`, `Frankfurt (EU)`) | Lowest latency for your household. |
| **Branch** | `main` | Production branch. |
| **Root Directory** | *(Leave blank)* | Uses repository root. |
| **Runtime** | `Node` | |
| **Build Command** | `npm run build` | Compiles both React PWA into `dist/` and server into `dist-server/`. |
| **Start Command** | `npm run start:web` | Starts the production Fastify server with pure Node (no dev tools). |
| **Instance Type / Plan** | **Free ($0/mo)** | No credit card required. |

### Step 3: Configure Environment Variables
Under the **Environment Variables** section, add the following key-value pairs:

| Key | Value | Purpose | Required? |
| :--- | :--- | :--- | :---: |
| `NODE_VERSION` | `22.14.0` | **Crucial:** Pins to Node 22 LTS to prevent the Node 24 native addon assertion crash. | **Yes** |
| `NODE_ENV` | `production` | Enables production optimizations, gzip compression, and security headers. | **Yes** |
| `HOST` | `0.0.0.0` | Binds server to all network interfaces so Render can route traffic. | **Yes** |
| `DATABASE_URL` | `sqlite://./data/pantry.db` | Points SQLite to local writable storage in the project directory. | **Yes** |
| `COOKIE_SECURE` | `true` | Ensures authentication cookies are sent over HTTPS only. | **Yes** |
| `SESSION_SECRET` | *(Click "Generate" or enter 32+ random characters)* | Cryptographic key used to sign session cookies. | **Yes** |
| `USER_AGENT` | `PantryRescue/1.0.0 (contact: admin@pantryrescue.local)` | Descriptive user-agent for Open Food Facts barcode lookup. | Optional |

> [!NOTE]
> Do **NOT** add a persistent disk under the Free plan. The database path `sqlite://./data/pantry.db` will automatically create the `./data` folder and run smoothly without disk mounts.

### Step 4: Configure Health Check Path
Click **Advanced** $\rightarrow$ **Health Check Path**:
- Set **Health Check Path** to: `/health`

### Step 5: Deploy
Click **Create Web Service**. Render will begin cloning, running `npm run build`, and starting the server.

---

## 🔍 How to Monitor & Verify Your Live Deployment

### Finding Your Live URL
Once the deploy is live, look at the top left of your service dashboard directly below the service name. You will see a link:
`https://pantry-rescue.onrender.com` (or your chosen custom domain).

### Checking Logs
1. Click the **Logs** tab in the left sidebar of your Web Service.
2. Verify that the build succeeds and the start log shows:
   ```
   Pantry Rescue API replica running at http://0.0.0.0:10000 [PID: ...]
   ```

### Verifying the Endpoints
1. **Health Check:** Open `https://<your-service>.onrender.com/health` in your browser.
   - Expected Output:
     ```json
     {"status":"ok","uptime":12.3,"db":"ok","timestamp":"2026-10-17T..."}
     ```
2. **API Health Check:** Open `https://<your-service>.onrender.com/api/health`
   - Expected Output: Same HTTP 200 OK status.
3. **PWA Frontend:** Open `https://<your-service>.onrender.com/`
   - You should see the dark-mode Pantry Rescue welcome interface featuring Sir Expiry.

---

## ❓ Architecture FAQ: "Should I switch to MongoDB?"

A common question when deploying to cloud platforms is: *"Should I rewrite the database layer to MongoDB or another NoSQL database?"*

### Why MongoDB is NOT Recommended for Pantry Rescue
Pantry Rescue was intentionally architected around a **relational transactional model** for fundamental reasons:

1. **Foreign Key Integrity & Cascades:**
   The domain models tightly couple `households` $\rightarrow$ `users` $\rightarrow$ `items` $\rightarrow$ `item_deltas` $\rightarrow$ `recipes` $\rightarrow$ `gamification_events`. When a household member updates an item or leaves a household, strict relational constraints prevent orphaned inventory and ghost claims.
2. **Atomic Offline Delta Synchronization:**
   To solve the concurrent cooking problem (two family members offline or cooking at the same time), Pantry Rescue uses an `item_deltas` transaction log rather than blindly overwriting the item quantity. This prevents lost updates. In document stores like MongoDB, multi-document ACID transactions across collections add overhead and complexity.
3. **Tamper-Proof Gamification & Scoreboard Auditing:**
   Pantry Rescue gamification recalculates weekly waste reduction, streaks, and pact adherence from immutable audit event rows (`gamification_events`) using SQL aggregations.
4. **Validated Test Suite:**
   All 41 unit, integration, concurrency, and IDOR security tests run and pass against this relational schema. Switching to MongoDB would break all relational constraints and require a rewrite of both schema migrations and domain services.

### Recommended Path for 100% Free Cloud Persistence: Turso (libSQL)
If you want **permanent data persistence on a $0 budget** (so data never resets even when Render Free spins down), the best option is **[Turso](https://turso.tech)**:
- **Cost:** 100% Free Tier ($0/month, no credit card required).
- **Generous Limits:** 9 GB of storage, 500 databases, up to 1 billion row reads per month.
- **Compatibility:** Turso is built on **libSQL** (an open-source fork of SQLite). It uses the **exact same SQLite SQL queries and schema** that Pantry Rescue already uses.
- **Setup:** Create a free database at `turso.tech`, get your database URL (`libsql://...`) and auth token, and pass it into `DATABASE_URL`. Zero schema rewrite needed.

Alternatively, for users preferring PostgreSQL, free serverless options include **[Supabase](https://supabase.com)** and **[Neon](https://neon.tech)** (both offer permanent free tiers).

---

## 🧪 Running the Live Smoke Test Script

Once deployed, you can verify all core workflows against your live deployment by running the included automated smoke test script from your local terminal:

```bash
# On Linux / macOS / Git Bash:
./scripts/smoke-live.sh https://pantry-rescue.onrender.com

# On Windows PowerShell:
bash scripts/smoke-live.sh https://pantry-rescue.onrender.com
```

The script verifies:
1. `/health` responds with `status: ok` and `db: ok`.
2. Registers a fresh test user and receives a session cookie.
3. Creates a new household.
4. Adds an active pantry item.
5. Reads back the pantry inventory and confirms the item is present.

---

## ⏪ How to Roll Back a Deployment

If a newly deployed commit causes an issue:
1. Go to your Web Service in the Render Dashboard.
2. Click the **Events** or **Deploys** tab.
3. Locate the last known good deployment.
4. Click the three dots (`...`) on the right side of that deploy.
5. Select **Rollback to this deploy**.
6. Render will instantly re-activate the selected build without downtime.
