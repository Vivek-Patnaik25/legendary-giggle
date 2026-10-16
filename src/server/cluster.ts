import http from 'http';
import { fork, ChildProcess } from 'child_process';
import path from 'path';

const LB_PORT = parseInt(process.env.LB_PORT || '3000', 10);
const REPLICA_PORTS = (process.env.API_PORTS || '3001,3002').split(',').map(p => parseInt(p.trim(), 10));

interface ReplicaStatus {
  id: string;
  port: number;
  isHealthy: boolean;
  activeRequests: number;
  process?: ChildProcess;
}

const replicas: ReplicaStatus[] = REPLICA_PORTS.map((port, idx) => ({
  id: `replica-${idx + 1}`,
  port,
  isHealthy: false,
  activeRequests: 0,
}));

let currentIndex = 0;

/**
 * Spawns child API replica processes
 */
function spawnReplicas() {
  const serverScript = path.resolve(process.cwd(), 'src/server/index.ts');

  for (const rep of replicas) {
    const child = fork(serverScript, [], {
      env: {
        ...process.env,
        PORT: String(rep.port),
        REPLICA_ID: rep.id,
      },
      execArgv: ['--import', 'tsx'],
    });

    rep.process = child;

    child.on('exit', (code, signal) => {
      console.warn(`[Cluster] ${rep.id} on port ${rep.port} exited with code ${code} (${signal}).`);
      rep.isHealthy = false;
    });
  }
}

/**
 * Checks health of a replica
 */
async function checkHealth(rep: ReplicaStatus): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${rep.port}/health`, { timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Health check monitor loop
 */
function startHealthChecks() {
  const interval = setInterval(async () => {
    for (const rep of replicas) {
      const healthy = await checkHealth(rep);
      if (rep.isHealthy !== healthy) {
        rep.isHealthy = healthy;
        console.log(`[Cluster Health] ${rep.id} (port ${rep.port}) is now ${healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
      }
    }
  }, 2000);

  // Initial check after 1.5 seconds
  setTimeout(async () => {
    for (const rep of replicas) {
      rep.isHealthy = await checkHealth(rep);
    }
  }, 1500);

  return interval;
}

/**
 * Reverse Proxy Load Balancer Server
 */
export function startLoadBalancer() {
  spawnReplicas();
  const healthInterval = startHealthChecks();

  const lbServer = http.createServer((clientReq, clientRes) => {
    // Pick next healthy replica via Round-Robin
    const healthyReplicas = replicas.filter(r => r.isHealthy);
    const targetReplica = healthyReplicas.length > 0
      ? healthyReplicas[currentIndex++ % healthyReplicas.length]
      : replicas[currentIndex++ % replicas.length]; // fallback

    targetReplica.activeRequests++;

    const requestId = clientReq.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const proxyOptions: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: targetReplica.port,
      path: clientReq.url,
      method: clientReq.method,
      headers: {
        ...clientReq.headers,
        'x-forwarded-for': clientReq.socket.remoteAddress || '127.0.0.1',
        'x-forwarded-proto': 'http',
        'x-forwarded-port': String(LB_PORT),
        'x-request-id': requestId,
        host: `127.0.0.1:${targetReplica.port}`,
      },
    };

    const proxyReq = http.request(proxyOptions, (proxyRes) => {
      // Injects load balancer evidence headers
      const headers = {
        ...proxyRes.headers,
        'x-served-by': targetReplica.id,
        'x-request-id': requestId,
      };

      clientRes.writeHead(proxyRes.statusCode || 200, headers);
      proxyRes.pipe(clientRes);

      proxyRes.on('end', () => {
        targetReplica.activeRequests--;
      });
    });

    proxyReq.on('error', (err) => {
      targetReplica.activeRequests--;
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'application/json', 'x-served-by': targetReplica.id });
        clientRes.end(JSON.stringify({ error: 'BAD_GATEWAY', message: 'Replica unavailable', details: err.message }));
      }
    });

    clientReq.pipe(proxyReq);
  });

  lbServer.listen(LB_PORT, () => {
    console.log(`==================================================================`);
    console.log(`[Pantry Rescue Load Balancer] Listening on http://localhost:${LB_PORT}`);
    console.log(`[Cluster] Balancing across ${replicas.length} API replicas: ${replicas.map(r => `${r.id} (port ${r.port})`).join(', ')}`);
    console.log(`==================================================================`);
  });

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('\n[Cluster] Graceful shutdown initiated. Draining connections...');
    clearInterval(healthInterval);

    lbServer.close(() => {
      console.log('[Cluster] Load balancer closed.');
      for (const rep of replicas) {
        if (rep.process) {
          rep.process.kill('SIGTERM');
        }
      }
      setTimeout(() => process.exit(0), 1000);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return lbServer;
}

if (process.argv[1]?.endsWith('cluster.ts')) {
  startLoadBalancer();
}
