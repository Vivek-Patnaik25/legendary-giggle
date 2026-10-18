import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function processImage(filename: string) {
  const filePath = path.join('public/assets', filename);
  const inputBuffer = fs.readFileSync(filePath);
  const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels should be 4 (RGBA)

  // We want to flood-fill transparent from the outer boundary
  // Any pixel connected to the boundary with color close to the background color becomes transparent.
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  // Helper to get index
  const idx = (x: number, y: number) => (y * width + x);

  // Check if pixel at (x, y) is background-like (light / near-white)
  const isBg = (x: number, y: number) => {
    const p = idx(x, y) * channels;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    // Background is near-white or light grey (r, g, b > 230)
    return r > 230 && g > 230 && b > 230;
  };

  // Seed boundary pixels
  for (let x = 0; x < width; x++) {
    if (isBg(x, 0)) { queue.push(x, 0); visited[idx(x, 0)] = 1; }
    if (isBg(x, height - 1)) { queue.push(x, height - 1); visited[idx(x, height - 1)] = 1; }
  }
  for (let y = 0; y < height; y++) {
    if (isBg(0, y)) { queue.push(0, y); visited[idx(0, y)] = 1; }
    if (isBg(width - 1, y)) { queue.push(width - 1, y); visited[idx(width - 1, y)] = 1; }
  }

  // BFS Flood Fill
  let head = 0;
  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];

    // Make this pixel transparent
    const p = idx(cx, cy) * channels;
    data[p + 3] = 0; // Alpha 0

    // Neighbors
    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIndex = idx(nx, ny);
        if (!visited[nIndex] && isBg(nx, ny)) {
          visited[nIndex] = 1;
          queue.push(nx, ny);
        }
      }
    }
  }

  // Optional: subtle edge feathering for smooth antialiasing
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = idx(x, y) * channels;
      if (data[p + 3] !== 0) {
        // If it's adjacent to a transparent pixel and somewhat light, soften alpha
        const hasTransparentNeighbor =
          data[idx(x + 1, y) * channels + 3] === 0 ||
          data[idx(x - 1, y) * channels + 3] === 0 ||
          data[idx(x, y + 1) * channels + 3] === 0 ||
          data[idx(x, y - 1) * channels + 3] === 0;

        if (hasTransparentNeighbor) {
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];
          if (r > 210 && g > 210 && b > 210) {
            const brightness = (r + g + b) / 3;
            // Map 210..255 to alpha 255..0
            const factor = Math.max(0, Math.min(1, (255 - brightness) / 45));
            data[p + 3] = Math.round(factor * 255);
          }
        }
      }
    }
  }

  // Save as TRUE PNG with alpha
  const outBuffer = await sharp(data, {
    raw: { width, height, channels },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  fs.writeFileSync(filePath, outBuffer);
  // Also sync to dist/assets/
  const distPath = path.join('dist/assets', filename);
  if (fs.existsSync('dist/assets')) {
    fs.writeFileSync(distPath, outBuffer);
  }
  console.log(`✓ Processed ${filename} -> true transparent PNG (${outBuffer.length} bytes)`);
}

async function main() {
  const mascots = [
    'sir_expiry_calm.png',
    'sir_expiry_worried.png',
    'sir_expiry_panicked.png',
    'logo.png',
    'badge_onion_survivor.png',
    'badge_freezer_archaeologist.png',
  ];

  for (const m of mascots) {
    await processImage(m);
  }
}

main().catch(console.error);
