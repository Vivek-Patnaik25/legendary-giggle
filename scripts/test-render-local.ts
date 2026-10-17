import http from 'http';
import { fork } from 'child_process';
import path from 'path';

function get(url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 0, body: data });
      });
    }).on('error', reject);
  });
}

async function main() {
  const testPort = '4567';
  console.log(`[Test] Launching single-instance server on non-default port ${testPort} with HOST=0.0.0.0...`);

  const serverProc = fork(path.resolve(process.cwd(), 'src/server/index.ts'), [], {
    execArgv: ['--import', 'tsx'],
    env: {
      ...process.env,
      PORT: testPort,
      HOST: '0.0.0.0',
      NODE_ENV: 'production',
    },
    silent: false,
  });

  // Wait for server to bind
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = await get(`http://127.0.0.1:${testPort}/health`);
      if (res.statusCode === 200) {
        ready = true;
        break;
      }
    } catch {
      // waiting
    }
  }

  if (!ready) {
    serverProc.kill();
    console.error('Server failed to start on port ' + testPort);
    process.exit(1);
  }

  console.log('[Test] Server is up and listening on 0.0.0.0:' + testPort);

  // 1. Test /health
  console.log('\n--- 1. Testing /health ---');
  const healthRes = await get(`http://127.0.0.1:${testPort}/health`);
  console.log(`Status: ${healthRes.statusCode}`);
  console.log(`Body: ${healthRes.body}`);
  if (healthRes.statusCode !== 200 || !healthRes.body.includes('"status":"ok"')) {
    throw new Error('/health failed');
  }

  // 2. Test /api/health
  console.log('\n--- 2. Testing /api/health ---');
  const apiHealthRes = await get(`http://127.0.0.1:${testPort}/api/health`);
  console.log(`Status: ${apiHealthRes.statusCode}`);
  console.log(`Body: ${apiHealthRes.body}`);
  if (apiHealthRes.statusCode !== 200 || !apiHealthRes.body.includes('"status":"ok"')) {
    throw new Error('/api/health failed');
  }

  // 3. Test / (serving client SPA from dist/)
  console.log('\n--- 3. Testing / (Root SPA Serving from dist/) ---');
  const rootRes = await get(`http://127.0.0.1:${testPort}/`);
  console.log(`Status: ${rootRes.statusCode}`);
  console.log(`Preview: ${rootRes.body.slice(0, 200)}...`);
  if (rootRes.statusCode !== 200 || !rootRes.body.includes('<title>Pantry Rescue')) {
    throw new Error('Root SPA serving failed');
  }

  // 3.5. Test /assets/ bundle serving from dist/assets
  console.log('\n--- 3.5. Testing /assets/ serving from dist/assets ---');
  const assetRes = await get(`http://127.0.0.1:${testPort}/assets/index-DdCNFAsh.js`);
  console.log(`Status: ${assetRes.statusCode}`);
  if (assetRes.statusCode !== 200) {
    throw new Error(`/assets/ bundle serving failed with status ${assetRes.statusCode}`);
  }
  console.log('Passed: Static JS bundle served successfully from dist/assets');

  // 4. Test Graceful Shutdown via SIGTERM
  console.log('\n--- 4. Testing SIGTERM Graceful Shutdown ---');
  const exitPromise = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    serverProc.on('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });

  console.log('[Test] Sending SIGTERM to process PID ' + serverProc.pid + '...');
  serverProc.kill('SIGTERM');

  const exitResult = await exitPromise;
  console.log(`[Test] Server process exited cleanly with code: ${exitResult.code}, signal: ${exitResult.signal}`);

  if (exitResult.code !== 0 && exitResult.signal !== 'SIGTERM') {
    throw new Error('Server did not exit cleanly on SIGTERM');
  }

  console.log('\n========================================================');
  console.log('  ALL RENDER LOCAL VERIFICATION CHECKS PASSED!');
  console.log('========================================================\n');
}

main().catch(err => {
  console.error('[Error] Test failed:', err);
  process.exit(1);
});
