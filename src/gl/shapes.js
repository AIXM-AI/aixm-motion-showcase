// Target generators for the baked forms (0–3). Ribbons and tunnel are derived in
// the vertex shader from gl_VertexID, so they cost no memory or upload.
//
// Positions are packed as normalized Int16 (÷ SCALE) — a quarter of the Float32
// upload. Builders are generators that yield every slice so the driver can
// time-box them into short tasks and keep the main thread responsive.

export const SCALE = 8;
const Q = 32767 / SCALE;
const SLICE = 1024;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(6.2831853 * r());

function put(out, i, x, y, z) {
  out[i * 3] = x * Q;
  out[i * 3 + 1] = y * Q;
  out[i * 3 + 2] = z * Q;
}

// Noise cloud: a tilted three-arm spiral nebula wrapped in drifting haze.
export function* cloud(out, n) {
  const r = rng(11);
  const c = Math.cos(1.05), s = Math.sin(1.05);
  for (let i = 0; i < n; i++) {
    let x, y, z;
    if (r() < 0.72) {
      const rad = Math.pow(r(), 0.85) * 4.3 + 0.12;
      const a = Math.floor(r() * 3) * 2.0944 + rad * 0.85 + gauss(r) * (0.22 + rad * 0.04);
      x = Math.cos(a) * rad;
      z = Math.sin(a) * rad;
      y = gauss(r) * 0.22 * (1.2 - rad / 6);
    } else {
      x = gauss(r) * 3.2;
      y = gauss(r) * 1.5;
      z = gauss(r) * 2.4;
    }
    put(out, i, x, y * c - z * s, y * s + z * c);
    if (i % SLICE === 0) yield;
  }
}

// Sphere/brain: Fibonacci shell with cortical folds and a hemispheric groove.
export function* brain(out, n) {
  const r = rng(23);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    let x, y, z;
    if (r() < 0.1) {
      const rad = Math.cbrt(r()) * 1.25;
      const u = r() * 2 - 1, a = r() * 6.2831853, q = Math.sqrt(1 - u * u);
      x = Math.cos(a) * q * rad; y = u * rad; z = Math.sin(a) * q * rad;
    } else {
      y = 1 - (2 * (i + 0.5)) / n;
      const q = Math.sqrt(1 - y * y), a = i * golden;
      x = Math.cos(a) * q; z = Math.sin(a) * q;
      const fold = Math.sin(x * 9 + Math.sin(y * 7) * 1.6) * Math.cos(z * 8 + Math.cos(x * 5)) * 0.07;
      const rad = 1.78 * (1 + fold);
      x *= rad * 1.02; y *= rad * 0.9; z *= rad * 1.18;
      x += Math.sign(x) * 0.09;
      if (Math.abs(x) < 0.16) x *= 0.6;
    }
    put(out, i, x, y, z);
    if (i % SLICE === 0) yield;
  }
}

// AIXM wordmark sampled from canvas text, stacked into five depth slices.
// The pixel scan happens in prepareGlyph() (async: waits for the web font).
export async function prepareGlyph() {
  const W = 1024, H = 300;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  try { await document.fonts.load('800 220px Montserrat'); } catch { /* system sans fallback */ }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 220px Montserrat, Arial, sans-serif';
  ctx.fillText('AIXM', W / 2, H / 2 + 8);
  const data = ctx.getImageData(0, 0, W, H).data;
  const pts = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (data[(y * W + x) * 4 + 3] > 140) pts.push(x, y);
  return { pts, W, H };
}

export function* glyph(out, n, { pts, W, H }) {
  const r = rng(37);
  const count = pts.length / 2;
  const scale = 6.2 / W;
  for (let i = 0; i < n; i++) {
    if (!count || r() < 0.035) {
      // A faint lattice of guide points behind the letters.
      put(out, i,
        Math.round((r() - 0.5) * 19) * 0.4 + gauss(r) * 0.02,
        Math.round((r() - 0.5) * 8) * 0.4 + gauss(r) * 0.02,
        -1.2);
    } else {
      const k = Math.floor(r() * count) * 2;
      put(out, i,
        (pts[k] + r() * 2 - W / 2) * scale,
        -(pts[k + 1] + r() * 2 - H / 2) * scale,
        (Math.floor(r() * 5) / 4 - 0.5) * 0.7 + gauss(r) * 0.015);
    }
    if (i % SLICE === 0) yield;
  }
}

// (2,3) torus knot with a particle tube around the curve.
export function* knot(out, n) {
  const r = rng(53);
  const P = 2, Qk = 3, S = 0.6, e = 1e-3;
  const c = (t, o) => {
    const rr = Math.cos(Qk * t) + 2;
    o[0] = rr * Math.cos(P * t) * S; o[1] = rr * Math.sin(P * t) * S; o[2] = -Math.sin(Qk * t) * S;
  };
  const a = [0, 0, 0], b = [0, 0, 0], d = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const t = r() * Math.PI * 2;
    c(t, a); c(t + e, b); c(t - e, d);
    let tx = b[0] - d[0], ty = b[1] - d[1], tz = b[2] - d[2];
    const tl = 1 / Math.sqrt(tx * tx + ty * ty + tz * tz); tx *= tl; ty *= tl; tz *= tl;
    let nx = b[0] + d[0] - 2 * a[0], ny = b[1] + d[1] - 2 * a[1], nz = b[2] + d[2] - 2 * a[2];
    const nl = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1); nx *= nl; ny *= nl; nz *= nl;
    const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
    const ang = r() * Math.PI * 2;
    const rad = r() < 0.8 ? 0.26 + gauss(r) * 0.018 : Math.sqrt(r()) * 0.22;
    const cs = Math.cos(ang) * rad, sn = Math.sin(ang) * rad;
    put(out, i, a[0] + nx * cs + bx * sn, a[1] + ny * cs + by * sn, a[2] + nz * cs + bz * sn);
    if (i % SLICE === 0) yield;
  }
}

// Per-particle seeds as normalized bytes: stagger, size, colour, noise phase.
export function* seeds(out, n) {
  const r = rng(97);
  for (let i = 0; i < n * 4; i++) {
    out[i] = (r() * 256) | 0;
    if (i % (SLICE * 4) === 0) yield;
  }
}
