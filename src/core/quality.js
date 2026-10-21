// Quality tier detection, in two halves so it works across threads:
//   qualityEnv()          main thread — media queries, screen, URL override
//   detectQuality(gl,env) wherever the WebGL context lives (worker or main)
// Tier 0 = low (no post, small budget), 1 = mid, 2 = high. `webgl: false` → CSS fallback.

const TIERS = [
  { tier: 0, particles: 14000, dprMax: 1, dprMin: 0.75, post: false, pointScale: 1.25 },
  { tier: 1, particles: 36000, dprMax: 1.5, dprMin: 0.85, post: true, pointScale: 1.1 },
  { tier: 2, particles: 96000, dprMax: 2, dprMin: 1, post: true, pointScale: 1 },
];

const WEAK_GPU = /(mali-[gt]?[0-7]\d|adreno \(tm\) [1-5]\d\d|powervr|sgx|intel.*(hd|uhd) graphics [1-6]\d{2})/i;
// Software rasterisers: Lighthouse / headless Chrome (SwiftShader, often wrapped as
// "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device ...)"), Mesa llvmpipe/softpipe/
// lavapipe, Windows' Basic Render Driver. failIfMajorPerformanceCaveat does not
// reliably reject these, so the renderer string is checked as well.
const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|mesa offscreen/i;
const STRONG_GPU = /(rtx|radeon rx|geforce gtx 1[06-9]|apple m\d|apple gpu|adreno \(tm\) [7-9]\d\d|mali-g7[1-9]|mali-g[89]\d|immortalis|arc a)/i;

export function qualityEnv() {
  const forced = new URLSearchParams(location.search).get('q');
  return {
    mobile: matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820,
    forced: forced !== null && /^[012]$/.test(forced) ? +forced : null,
  };
}

// The context is created once, on the real canvas, and handed to the renderer —
// a throwaway probe context would cost a second (slow) context creation.
export function createContext(canvas) {
  try {
    return canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
      // Software rasterisers (SwiftShader, llvmpipe) get the CSS composition instead.
      failIfMajorPerformanceCaveat: true,
    });
  } catch {
    return null;
  }
}

/**
 * @param {WebGL2RenderingContext | null} gl
 * @param {ReturnType<typeof qualityEnv>} env
 */
export function detectQuality(gl, env) {
  if (!gl) return { webgl: false, tier: -1 };
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  // Software GL → CSS composition, never a continuous loop (even when forced via ?q=).
  if (SOFTWARE_GPU.test(renderer)) return { webgl: false, tier: -1, software: true, renderer };
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const { mobile } = env;

  let score = 1;
  if (STRONG_GPU.test(renderer)) score += 1;
  if (WEAK_GPU.test(renderer)) score -= 1;
  if (cores <= 4 || memory <= 2) score -= 1;
  if (mobile) score = Math.min(score, 1) - (memory <= 4 ? 1 : 0);
  if (maxTex < 8192) score -= 1;

  const tier = env.forced ?? Math.max(0, Math.min(2, score));
  const base = TIERS[tier];
  // Mobile budgets stay inside 15–25k regardless of tier.
  const particles = mobile ? Math.min(base.particles, tier === 0 ? 14000 : 22000) : base.particles;
  return { webgl: true, mobile, renderer, ...base, particles };
}
