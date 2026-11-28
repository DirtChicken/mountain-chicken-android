/**
 * Surface nets, ported from Mikola Lysenko's isosurface (MIT, 2012),
 * based on S.F. Gibson, "Constrained Elastic Surface Nets" (1998).
 * Negative potential is inside the volume.
 */

const cubeEdges = new Int32Array(24);
const edgeTable = new Int32Array(256);

(function initTables() {
  let k = 0;
  for (let i = 0; i < 8; i++) {
    for (let j = 1; j <= 4; j <<= 1) {
      const p = i ^ j;
      if (i <= p) {
        cubeEdges[k++] = i;
        cubeEdges[k++] = p;
      }
    }
  }
  for (let i = 0; i < 256; i++) {
    let em = 0;
    for (let j = 0; j < 24; j += 2) {
      const a = (i & (1 << cubeEdges[j])) !== 0;
      const b = (i & (1 << cubeEdges[j + 1])) !== 0;
      em |= a !== b ? 1 << (j >> 1) : 0;
    }
    edgeTable[i] = em;
  }
})();

export function surfaceNets(
  dims: [number, number, number],
  potential: (x: number, y: number, z: number) => number,
  bounds: [[number, number, number], [number, number, number]],
): { positions: number[][]; cells: number[][] } {
  const scale = [0, 0, 0];
  const shift = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    scale[i] = (bounds[1][i] - bounds[0][i]) / dims[i];
    shift[i] = bounds[0][i];
  }

  const vertices: number[][] = [];
  const faces: number[][] = [];
  const x = [0, 0, 0];
  const R = [1, dims[0] + 1, (dims[0] + 1) * (dims[1] + 1)];
  const grid = [0, 0, 0, 0, 0, 0, 0, 0];
  const buffer = new Int32Array(R[2] * 2);
  buffer.fill(-1);
  let bufNo = 1;

  for (x[2] = 0; x[2] < dims[2] - 1; ++x[2], bufNo ^= 1, (R[2] = -R[2])) {
    let m = 1 + (dims[0] + 1) * (1 + bufNo * (dims[1] + 1));
    for (x[1] = 0; x[1] < dims[1] - 1; ++x[1], (m += 2)) {
      for (x[0] = 0; x[0] < dims[0] - 1; ++x[0], ++m) {
        let mask = 0;
        let g = 0;
        for (let k = 0; k < 2; k++) {
          for (let j = 0; j < 2; j++) {
            for (let i = 0; i < 2; i++, g++) {
              const p = potential(
                scale[0] * (x[0] + i) + shift[0],
                scale[1] * (x[1] + j) + shift[1],
                scale[2] * (x[2] + k) + shift[2],
              );
              grid[g] = p;
              mask |= p < 0 ? 1 << g : 0;
            }
          }
        }
        if (mask === 0 || mask === 0xff) continue;

        const edgeMask = edgeTable[mask];
        const v = [0, 0, 0];
        let eCount = 0;
        for (let i = 0; i < 12; i++) {
          if ((edgeMask & (1 << i)) === 0) continue;
          eCount++;
          const e0 = cubeEdges[i << 1];
          const e1 = cubeEdges[(i << 1) + 1];
          const g0 = grid[e0];
          const g1 = grid[e1];
          let t = g0 - g1;
          if (Math.abs(t) > 1e-6) t = g0 / t;
          else continue;
          for (let j = 0, bit = 1; j < 3; j++, bit <<= 1) {
            const a = e0 & bit;
            const b = e1 & bit;
            if (a !== b) v[j] += a ? 1 - t : t;
            else v[j] += a ? 1 : 0;
          }
        }
        if (eCount === 0) continue;
        const s = 1 / eCount;
        for (let i = 0; i < 3; i++) v[i] = scale[i] * (x[i] + s * v[i]) + shift[i];

        buffer[m] = vertices.length;
        vertices.push(v);

        for (let i = 0; i < 3; i++) {
          if ((edgeMask & (1 << i)) === 0) continue;
          const iu = (i + 1) % 3;
          const iv = (i + 2) % 3;
          if (x[iu] === 0 || x[iv] === 0) continue;
          const du = R[iu];
          const dv = R[iv];
          const i0 = buffer[m];
          const i1 = buffer[m - du];
          const i2 = buffer[m - dv];
          const i3 = buffer[m - du - dv];
          if (i0 < 0 || i1 < 0 || i2 < 0 || i3 < 0) continue;
          if (mask & 1) {
            faces.push([i0, i1, i2]);
            faces.push([i2, i1, i3]);
          } else {
            faces.push([i0, i2, i1]);
            faces.push([i1, i2, i3]);
          }
        }
      }
    }
  }

  return { positions: vertices, cells: faces };
}
