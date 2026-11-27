export type Feature = { x: number; y: number; descriptor: Uint8Array };

const CIRCLE = [
  [0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3],
  [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3],
];

const PAIRS = briefPairs(256);

export function sharpness(gray: Uint8Array, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const index = y * width + x;
      const lap = 4 * gray[index] - gray[index - 1] - gray[index + 1] - gray[index - width] - gray[index + width];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  if (!count) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

export function extractFeatures(rgba: Uint8Array, width: number, height: number, limit = 80): Feature[] {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = rgba[i * 4];
  const scored: { x: number; y: number; score: number }[] = [];
  const cell = 18;
  const best = new Map<string, { x: number; y: number; score: number }>();
  for (let y = 4; y < height - 4; y += 2) {
    for (let x = 4; x < width - 4; x += 2) {
      const score = fastScore(gray, width, x, y, 24);
      if (score < 9) continue;
      const key = `${Math.floor(x / cell)}|${Math.floor(y / cell)}`;
      const current = best.get(key);
      if (!current || score > current.score) best.set(key, { x, y, score });
    }
  }
  for (const corner of best.values()) scored.push(corner);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((corner) => ({
    x: corner.x,
    y: corner.y,
    descriptor: describe(gray, width, height, corner.x, corner.y),
  }));
}

export function hamming(a: Uint8Array, b: Uint8Array): number {
  let bits = 0;
  for (let i = 0; i < a.length; i++) {
    let value = a[i] ^ b[i];
    while (value) {
      bits += value & 1;
      value >>= 1;
    }
  }
  return bits;
}

export function matchFeatures(live: Feature[], known: Feature[], ratio = 0.8): { live: number; known: number }[] {
  const pairs: { live: number; known: number; distance: number }[] = [];
  live.forEach((feature, liveIndex) => {
    let best = Infinity;
    let second = Infinity;
    let knownIndex = -1;
    known.forEach((other, index) => {
      const distance = hamming(feature.descriptor, other.descriptor);
      if (distance < best) {
        second = best;
        best = distance;
        knownIndex = index;
      } else if (distance < second) second = distance;
    });
    if (knownIndex >= 0 && best < 80 && best < second * ratio) pairs.push({ live: liveIndex, known: knownIndex, distance: best });
  });
  return pairs;
}

function fastScore(gray: Uint8Array, width: number, x: number, y: number, threshold: number): number {
  const center = gray[y * width + x];
  let brighter = 0;
  let darker = 0;
  let runBright = 0;
  let runDark = 0;
  let best = 0;
  for (let lap = 0; lap < 2; lap++) {
    for (const [dx, dy] of CIRCLE) {
      const value = gray[(y + dy) * width + (x + dx)];
      if (value > center + threshold) {
        brighter++;
        runBright++;
        runDark = 0;
      } else if (value < center - threshold) {
        darker++;
        runDark++;
        runBright = 0;
      } else {
        runBright = 0;
        runDark = 0;
      }
      best = Math.max(best, runBright, runDark);
    }
  }
  return best >= 9 ? Math.max(brighter, darker) : 0;
}

function describe(gray: Uint8Array, width: number, height: number, x: number, y: number): Uint8Array {
  let m10 = 0;
  let m01 = 0;
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const weight = gray[py * width + px];
      m10 += dx * weight;
      m01 += dy * weight;
    }
  }
  const angle = Math.atan2(m01, m10);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const bytes = new Uint8Array(32);
  PAIRS.forEach((pair, index) => {
    const ax = Math.round(x + pair[0] * cos - pair[1] * sin);
    const ay = Math.round(y + pair[0] * sin + pair[1] * cos);
    const bx = Math.round(x + pair[2] * cos - pair[3] * sin);
    const by = Math.round(y + pair[2] * sin + pair[3] * cos);
    const left = sample(gray, width, height, ax, ay);
    const right = sample(gray, width, height, bx, by);
    if (left < right) bytes[index >> 3] |= 1 << (index & 7);
  });
  return bytes;
}

function sample(gray: Uint8Array, width: number, height: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return gray[y * width + x];
}

function briefPairs(count: number): number[][] {
  let state = 0x1234567;
  const next = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return (state >>> 16) & 31;
  };
  const pairs: number[][] = [];
  for (let i = 0; i < count; i++) pairs.push([next() - 15, next() - 15, next() - 15, next() - 15]);
  return pairs;
}

export function grayFromRgba(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round(0.3 * rgba[i * 4] + 0.59 * rgba[i * 4 + 1] + 0.11 * rgba[i * 4 + 2]);
  return gray;
}
