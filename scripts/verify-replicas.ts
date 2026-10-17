import http from 'http';
import { fork } from 'child_process';
import path from 'path';

async function main() {
  console.log('[Setup] Starting cluster on port 3000 (replicas: 3001, 3002)...');
  const cluster = fork(path.resolve(process.cwd(), 'src/server/cluster.ts'), [], {
    execArgv: ['--import', 'tsx'],
    env: { ...process.env, LB_PORT: '3000', API_PORTS: '3001,3002' },
    silent: true,
  });

  // Wait for health endpoint to respond
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get('http://127.0.0.1:3000/health', (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on('error', reject);
      });
      ready = true;
      break;
    } catch {
      // keep waiting
    }
  }

  if (!ready) {
    cluster.kill();
    console.error('Cluster failed to become ready within timeout.');
    process.exit(1);
  }

  console.log('[Verify] Cluster ready. Sending sequential requests to verify X-Served-By round-robin distribution:\n');

  for (let i = 1; i <= 6; i++) {
    await new Promise<void>((resolve, reject) => {
      const req = http.get('http://127.0.0.1:3000/health', (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          console.log(`Request #${i}:`);
          console.log(`  HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage}`);
          console.log(`  x-served-by: ${res.headers['x-served-by']}`);
          console.log(`  x-request-id: ${res.headers['x-request-id']}`);
          console.log(`  body: ${body.trim()}`);
          console.log('');
          resolve();
        });
      });
      req.on('error', reject);
    });
  }

  cluster.kill('SIGTERM');
  console.log('[Cleanup] Cluster shut down cleanly.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
