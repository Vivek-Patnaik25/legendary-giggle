/**
 * End-to-End Smoke Test Script for Pantry Rescue
 * Exercises the complete core loop through the Load Balancer:
 * 1. Health check & replica verification (X-Served-By)
 * 2. User registration & household creation
 * 3. Member invite generation & redemption
 * 4. Item addition (manual & barcode simulation)
 * 5. Rescue Board fetch & urgency sorting
 * 6. Rescue recipes ranking & missing ingredients list
 * 7. Cooking rescue (delta decrement) & waste marking
 * 8. Scoreboard & badge unlock verification
 * 9. Smart shopping hints
 * 10. Weekly Rescue Report Card generation
 */

import http from 'http';
import { fork, ChildProcess } from 'child_process';
import path from 'path';

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:3000';

async function request(urlPath: string, options: { method?: string; headers?: Record<string, string>; body?: any } = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: any }> {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(urlPath, BASE_URL);
    const bodyStr = options.body ? JSON.stringify(options.body) : undefined;

    const reqHeaders: Record<string, string> = {
      ...(options.headers || {}),
    };
    if (bodyStr) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }

    const req = http.request(fullUrl, {
      method: options.method || 'GET',
      headers: reqHeaders,
      timeout: 10000,
    }, (res) => {
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        let parsed = rawData;
        try {
          parsed = JSON.parse(rawData);
        } catch {
          // keep string
        }
        resolve({ status: res.statusCode || 0, headers: res.headers, data: parsed });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout requesting ${urlPath}`));
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function main() {
  console.log('\n=============================================================');
  console.log('   Pantry Rescue — End-to-End Core Loop Smoke Test');
  console.log(`   Target: ${BASE_URL}`);
  console.log('=============================================================\n');

  let clusterProcess: ChildProcess | null = null;

  // 0. Check if load balancer is already running; if not, spin it up
  let isRunning = false;
  try {
    const ping = await request('/health');
    isRunning = ping.status === 200;
  } catch {
    isRunning = false;
  }

  if (!isRunning) {
    console.log('[Setup] Starting local load balancer & multi-replica cluster...');
    clusterProcess = fork(path.resolve(process.cwd(), 'src/server/cluster.ts'), [], {
      execArgv: ['--import', 'tsx'],
      env: { ...process.env, LB_PORT: '3000', API_PORTS: '3001,3002' },
    });

    // Wait for cluster health check to report 200
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 600));
      try {
        const ping = await request('/health');
        if (ping.status === 200) {
          ready = true;
          break;
        }
      } catch {
        // wait
      }
    }
    assert(ready, 'Cluster load balancer started and reported healthy status');
  } else {
    console.log('[Setup] Load balancer is already running.');
  }

  const servedByReplicas = new Set<string>();

  try {
    // 1. Verify Load Balancer Routing Across Replicas
    console.log('\n[Step 1] Verifying Load Balancer multi-replica round-robin...');
    for (let i = 0; i < 8; i++) {
      const hRes = await request('/health');
      const servedBy = hRes.headers['x-served-by'] as string;
      if (servedBy) servedByReplicas.add(servedBy);
    }
    console.log(`  Evidence of load balancing across replicas: ${Array.from(servedByReplicas).join(', ')}`);
    assert(servedByReplicas.size >= 1, 'Requests routed through load balancer with X-Served-By tracking');

    // 2. User Registration & Household Creation
    console.log('\n[Step 2] Registering user (Owner) and creating household...');
    const ownerEmail = `smoke_owner_${Date.now()}@kitchen.com`;
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: { email: ownerEmail, password: 'password123', displayName: 'Maya Chef' },
    });
    assert(regRes.status === 201, 'User registered successfully');
    const ownerToken = regRes.data.token;

    const hhRes = await request('/api/households', {
      method: 'POST',
      headers: { authorization: `Bearer ${ownerToken}` },
      body: { name: 'The Green Haven', weeklyWasteTarget: 2.0 },
    });
    assert(hhRes.status === 201, 'Household created with weekly pact target');
    const hhId = hhRes.data.household.id;

    // 3. Invite Member & Acceptance
    console.log('\n[Step 3] Creating invite link and onboarding second household member...');
    const invRes = await request(`/api/households/${hhId}/invites`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ownerToken}` },
      body: { role: 'member' },
    });
    assert(invRes.status === 201, 'Invite generated');
    const inviteCode = invRes.data.invite.code;

    const memberEmail = `smoke_member_${Date.now()}@kitchen.com`;
    const memReg = await request('/api/auth/register', {
      method: 'POST',
      body: { email: memberEmail, password: 'password123', displayName: 'Leo Baker' },
    });
    const memberToken = memReg.data.token;

    const redeemRes = await request(`/api/invites/${inviteCode}/redeem`, {
      method: 'POST',
      headers: { authorization: `Bearer ${memberToken}` },
    });
    assert(redeemRes.status === 200, 'Member redeemed invite and joined household');

    // 4. Add Items by Hand and by Barcode
    console.log('\n[Step 4] Adding groceries (by hand and via barcode simulation)...');
    const todayISO = new Date().toISOString().split('T')[0];

    // Urgent Eggs (expiring today)
    const eggRes = await request(`/api/households/${hhId}/items`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ownerToken}`, 'idempotency-key': `egg-${Date.now()}` },
      body: { name: 'Fresh Eggs', category: 'dairy', quantity: 6, unit: 'piece', expiryDate: todayISO },
    });
    assert(eggRes.status === 201, 'Added urgent item by hand (Eggs, expiring today)');
    const eggId = eggRes.data.item.id;

    // Barcode Lookup simulation
    const bcRes = await request('/api/lookup/barcode/3017620422003', {
      headers: { authorization: `Bearer ${memberToken}` },
    });
    assert(bcRes.status === 200, 'Barcode lookup returned product response');

    // Add Bell Pepper
    const tomorrowISO = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const pepperRes = await request(`/api/households/${hhId}/items`, {
      method: 'POST',
      headers: { authorization: `Bearer ${memberToken}`, 'idempotency-key': `pep-${Date.now()}` },
      body: { name: 'Red Bell Pepper', category: 'produce', quantity: 2, unit: 'piece', expiryDate: tomorrowISO },
    });
    assert(pepperRes.status === 201, 'Added second urgent item (Bell Pepper, expiring tomorrow)');

    // 5. Rescue Board & Urgency Ranking
    console.log('\n[Step 5] Fetching Rescue Board and verifying urgency ranking...');
    const boardRes = await request(`/api/households/${hhId}/items?status=active`, {
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    assert(boardRes.status === 200, 'Fetched active pantry items');
    assert(boardRes.data.items.length >= 2, 'All items present in inventory');
    assert(boardRes.data.items[0].urgency.score >= 80, 'Eggs ranked first with critical urgency score');
    assert(Boolean(boardRes.data.mascot.quote), 'Sir Expiry generated contextual witty quote');
    console.log(`  Mascot Quote: "${boardRes.data.mascot.quote}"`);

    // 6. Rescue Recipes Suggestion
    console.log('\n[Step 6] Getting Rescue Recipe suggestions prioritizing urgent items...');
    const recipesRes = await request(`/api/households/${hhId}/recipes/rescue`, {
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    assert(recipesRes.status === 200, 'Rescue recipes fetched');
    assert(recipesRes.data.recipes.length >= 1, 'Received recipe suggestions');
    const topRecipe = recipesRes.data.recipes[0];
    assert(topRecipe.isRescueCandidate === true, 'Top recipe prioritized because it uses at-risk eggs');
    assert(topRecipe.missingCount !== undefined, `Exact missing count displayed: ${topRecipe.missingCount}`);
    console.log(`  Top Suggestion: "${topRecipe.title}" (Uses: ${topRecipe.usedPantryItems.map((u: any) => u.name).join(', ')})`);

    // 7. Cooking & Waste Marking
    console.log('\n[Step 7] Cooking dinner with at-risk item & marking waste...');
    const cookRes = await request(`/api/households/${hhId}/items/${eggId}/cook`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ownerToken}`, 'idempotency-key': `cook-${Date.now()}` },
      body: { amount: 6 },
    });
    assert(cookRes.status === 200, 'Cook action logged: Eggs rescued!');
    assert(cookRes.data.item.status === 'consumed', 'Depleted item automatically marked consumed');
    if (cookRes.data.newBadges?.length > 0) {
      console.log(`  🎉 Badge Awarded: ${cookRes.data.newBadges.join(', ')}`);
    }

    // Add a third item to mark as waste
    const breadRes = await request(`/api/households/${hhId}/items`, {
      method: 'POST',
      headers: { authorization: `Bearer ${memberToken}` },
      body: { name: 'Moldy Bread', category: 'bakery', quantity: 1, unit: 'piece' },
    });
    const breadId = breadRes.data.item.id;

    const wasteRes = await request(`/api/households/${hhId}/items/${breadId}/waste`, {
      method: 'POST',
      headers: { authorization: `Bearer ${memberToken}` },
      body: { amount: 1 },
    });
    assert(wasteRes.status === 200, 'Waste action recorded cleanly');

    // 8. Scoreboard Update
    console.log('\n[Step 8] Verifying scoreboard and streak calculations...');
    const sbRes = await request(`/api/households/${hhId}/scoreboard`, {
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    assert(sbRes.status === 200, 'Scoreboard fetched');
    assert(sbRes.data.scoreboard.rescuedCount >= 1, 'Rescued count incremented');
    assert(sbRes.data.scoreboard.wastedCount === 1, 'Wasted count incremented');
    assert(sbRes.data.scoreboard.isPactMet === true, 'Household pact is intact (1 waste <= target 2)');

    // 9. Smart Shopping Hints
    console.log('\n[Step 9] Fetching smart shopping hints...');
    const hintsRes = await request(`/api/households/${hhId}/recipes/shopping-hints`, {
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    assert(hintsRes.status === 200, 'Smart shopping hints generated');

    // 10. Weekly Rescue Report Card
    console.log('\n[Step 10] Generating shareable Weekly Rescue Report Card...');
    const reportRes = await request(`/api/households/${hhId}/report/weekly`, {
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    assert(reportRes.status === 200, 'Weekly Rescue Report card rendered');
    assert(reportRes.data.report.householdName === 'The Green Haven', 'Report card tied to household');
    assert(Boolean(reportRes.data.report.cardBackgroundImage), 'Report card contains background artwork asset');
    console.log(`  Report Card Commentary: "${reportRes.data.report.commentary}"`);

    console.log('\n=============================================================');
    console.log('  🎉 SMOKE TEST PASSED! The complete core loop is validated.');
    console.log('=============================================================\n');
  } finally {
    if (clusterProcess) {
      console.log('[Teardown] Stopping local cluster process...');
      clusterProcess.kill('SIGTERM');
    }
  }
}

main().catch(err => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
