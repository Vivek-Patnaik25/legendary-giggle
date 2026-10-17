# 🚀 Deploying Pantry Rescue to Render

This step-by-step guide explains how to deploy **Pantry Rescue** to [Render](https://render.com) as a unified, single-instance production Web Service hosting both the Fastify backend API and the installable React PWA frontend.

---

## 💰 Pricing & Plan Requirements

> [!IMPORTANT]
> **Persistent Disk Requirement:**
> Render's **Free** web service tier does not support persistent disks (all files are wiped whenever the container restarts, sleeps, or redeploys).
> To persist your SQLite database, households, and inventory across deployments:
> - **Web Service Plan:** **Starter ($7/month)**
> - **Persistent Disk:** **1 GB ($0.25/month)**
> - **Total Estimated Cost:** **~$7.25/month**
>
> *(If you choose the Free plan for a temporary demo, omit the disk and set `DATABASE_URL=sqlite://./data/pantry.db`. Note that all pantry items and user accounts will reset when the instance spins down).*

---

## 🛠️ Deployment Method 1: Blueprint Deploy (Recommended / Easiest)

Because this repository includes a [`render.yaml`](file:///s:/AutoProj/Proj1/render.yaml) file, Render can configure everything automatically:

1. Log into your account at [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** (top right) $\rightarrow$ **Blueprint**.
3. Connect your GitHub repository (`legendary-giggle`).
4. Render will read `render.yaml` and show:
   - **Service Name:** `pantry-rescue`
   - **Runtime:** `Node`
   - **Build Command:** `npm run build`
   - **Start Command:** `npm run start:web`
   - **Health Check Path:** `/health`
   - **Disk:** `pantry-data` mounted at `/var/data` (1 GB)
   - **Environment Variables:** `NODE_ENV`, `HOST`, `DATABASE_URL`, `COOKIE_SECURE`, and an automatically generated `SESSION_SECRET`.
5. Click **Apply**. Render will provision the disk, build the client and server, and start the application.

---

## 📋 Deployment Method 2: Manual Step-by-Step Dashboard Setup

Follow these manual steps if you prefer creating the Web Service manually:

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
| **Instance Type / Plan** | **Starter ($7/mo)** | Required to attach a persistent disk. |

### Step 3: Add the Persistent Disk
*(Scroll down to the "Disks" section or click "Advanced" $\rightarrow$ "Add Disk")*:
- **Disk Name:** `pantry-data`
- **Mount Path:** `/var/data`
- **Size:** `1 GB` (Cost: $0.25/month).

### Step 4: Configure Environment Variables
In the "Environment Variables" section, add the following key-value pairs:

| Key | Value | Purpose | Required? |
| :--- | :--- | :--- | :---: |
| `NODE_ENV` | `production` | Enables production optimizations and security headers. | **Yes** |
| `HOST` | `0.0.0.0` | Binds server to all network interfaces so Render can route traffic. | **Yes** |
| `DATABASE_URL` | `sqlite:///var/data/pantry.db` | Points SQLite to the persistent disk volume. | **Yes** |
| `COOKIE_SECURE` | `true` | Ensures authentication cookies are sent over HTTPS only. | **Yes** |
| `SESSION_SECRET` | *(Click "Generate" or enter 32+ random characters)* | Cryptographic key used to sign session cookies. | **Yes** |
| `USER_AGENT` | `PantryRescue/1.0.0 (contact: admin@pantryrescue.local)` | Descriptive user-agent for Open Food Facts barcode lookup. | Optional |

### Step 5: Configure Health Check Path
Click **Advanced** $\rightarrow$ **Health Check Path**:
- Set **Health Check Path** to: `/health`

### Step 6: Deploy
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
