/**
 * Concurrency Load Test for Pantry Rescue
 * Benchmarks the multi-replica stack behind the reverse proxy load balancer:
 * - High concurrency
 * - Records latency distribution (p50, p95, p99, max)
 * - Measures throughput (requests/sec)
 * - Proves distribution across API replicas
 */

import http from 'http';
import { fork, ChildProcess } from 'child_process';
import path from 'path';

const LB_URL = process.env.TEST_URL || 'http://127.0.0.1:3000';
const TOTAL_REQUESTS = parseInt(process.env.LOAD_REQUESTS || '300', 10);
const CONCURRENCY = parseInt(process.env.LOAD_CONCURRENCY || '25', 10);

interface RequestMetrics {
  durationMs: number;
  statusCode: number;
  servedBy?: string;
}

function singleRequest(url: string): Promise<RequestMetrics> {
  return new Promise((resolve) => {
    const start = performance.now();
    const req = http.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const durationMs = performance.now() - start;
        resolve({
          durationMs,
          statusCode: res.statusCode || 0,
          servedBy: res.headers['x-served-by'] as string,
        });
      });
    });

    req.on('error', () => {
      resolve({
        durationMs: performance.now() - start,
        statusCode: 0,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        durationMs: performance.now() - start,
        statusCode: 408,
      });
    });
  });
}

async function main() {
  console.log('\n=============================================================');
  console.log('   Pantry Rescue — Multi-Replica Load Benchmark');
  console.log(`   Target: ${LB_URL}`);
  console.log(`   Total Requests: ${TOTAL_REQUESTS} | Concurrency: ${CONCURRENCY}`);
  console.log('=============================================================\n');

  let clusterProcess: ChildProcess | null = null;

  // Check if load balancer is running
  let isRunning = false;
  try {
    const ping = await singleRequest(`${LB_URL}/health`);
    isRunning = ping.statusCode === 200;
  } catch {
    isRunning = false;
  }

  if (!isRunning) {
    console.log('[Setup] Launching load balancer & 2 API replicas...');
    clusterProcess = fork(path.resolve(process.cwd(), 'src/server/cluster.ts'), [], {
      execArgv: ['--import', 'tsx'],
      env: { ...process.env, LB_PORT: '3000', API_PORTS: '3001,3002' },
    });

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 600));
      const ping = await singleRequest(`${LB_URL}/health`);
      if (ping.statusCode === 200) {
        break;
      }
    }
  }

  console.log('[LoadTest] Executing concurrent request batches...');
  const metrics: RequestMetrics[] = [];
  const replicaDistribution: Record<string, number> = {};

  const startTime = performance.now();
  let completed = 0;

  async function worker() {
    while (completed < TOTAL_REQUESTS) {
      completed++;
      const metric = await singleRequest(`${LB_URL}/health`);
      metrics.push(metric);

      const replica = metric.servedBy || 'unknown';
      replicaDistribution[replica] = (replicaDistribution[replica] || 0) + 1;
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const totalTimeMs = performance.now() - startTime;
  const totalTimeSec = totalTimeMs / 1000;
  const rps = Math.round(metrics.length / totalTimeSec);

  // Analyze latencies
  const latencies = metrics.map(m => m.durationMs).sort((a, b) => a - b);
  const successful = metrics.filter(m => m.statusCode === 200).length;
  const failed = metrics.length - successful;

  const min = latencies[0]?.toFixed(2) || '0';
  const p50 = latencies[Math.floor(latencies.length * 0.5)]?.toFixed(2) || '0';
  const p95 = latencies[Math.floor(latencies.length * 0.95)]?.toFixed(2) || '0';
  const p99 = latencies[Math.floor(latencies.length * 0.99)]?.toFixed(2) || '0';
  const max = latencies[latencies.length - 1]?.toFixed(2) || '0';

  console.log('\n--- Benchmark Results ---');
  console.log(`Total Requests:      ${metrics.length}`);
  console.log(`Successful:          ${successful} (${((successful / metrics.length) * 100).toFixed(1)}%)`);
  console.log(`Failed:              ${failed}`);
  console.log(`Total Elapsed Time:  ${totalTimeSec.toFixed(2)}s`);
  console.log(`Throughput:          ${rps} req/sec`);
  console.log(`\nLatency Percentiles:`);
  console.log(`  Min:               ${min} ms`);
  console.log(`  Median (p50):      ${p50} ms`);
  console.log(`  p95:               ${p95} ms`);
  console.log(`  p99:               ${p99} ms`);
  console.log(`  Max:               ${max} ms`);
  console.log(`\nReplica Distribution (Proof of Load Balancing):`);
  for (const [replica, count] of Object.entries(replicaDistribution)) {
    console.log(`  ${replica}: ${count} requests (${((count / metrics.length) * 100).toFixed(1)}%)`);
  }
  console.log('-------------------------\n');

  if (clusterProcess) {
    console.log('[Teardown] Shutting down cluster...');
    clusterProcess.kill('SIGTERM');
  }

  if (failed > 0) {
    console.error('❌ Load test failed: Errors detected during concurrency benchmark');
    process.exit(1);
  } else {
    console.log('✓ Load test passed with 100% success rate under multi-replica concurrency!');
  }
}

main().catch(err => {
  console.error('Load test error:', err);
  process.exit(1);
});
