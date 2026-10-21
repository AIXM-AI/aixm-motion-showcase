import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createParticles } from './Particles.js';
import { Post } from './Post.js';

// DOM-free on purpose: runs in a worker on an OffscreenCanvas, or on the main
// thread as a fallback. The host (gl/host.js) feeds size, visibility and state.

const INK = 0x07070a;
// Environment accent per scene beat (feeds the iridescence phase).
const ACCENT = [0.0, 0.35, 0.7, 1.05, 1.4, 1.8];

// Frame-rate independent damping: same feel at 30, 60 or 120 Hz.
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

const raf = globalThis.requestAnimationFrame
  ? (cb) => globalThis.requestAnimationFrame(cb)
  : (cb) => setTimeout(() => cb(performance.now()), 16);
const caf = globalThis.cancelAnimationFrame ? (id) => globalThis.cancelAnimationFrame(id) : clearTimeout;

// Watchdog: frame time above budget (< 25 fps, so 30 Hz-capped phones still pass)
// for this long drops one step — first minimum resolution, no post and half the
// particles, then a still frame. Milder overruns are left to the adaptive DPR.
const BUDGET_MS = 40;
const OVER_BUDGET_S = 2;

/**
 * @param {object} o
 * @param {HTMLCanvasElement | OffscreenCanvas} o.canvas
 * @param {WebGL2RenderingContext} o.context  created by core/quality.js
 * @param {{ morph:number, mouse:{x:number,y:number}, pointer:boolean, hold:boolean, reduced:boolean }} o.state
 * @param {ReturnType<import('../core/quality.js').detectQuality>} o.quality
 * @param {{ width:number, height:number, dpr:number }} o.view  CSS size + device pixel ratio
 * @param {string} [o.fontUrl]
 */
export async function createScene({ canvas, context, state, quality, view, fontUrl }) {
  const renderer = new WebGLRenderer({
    canvas,
    context,
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(INK, 1);
  // Synchronous program-status queries stall the thread; dev builds keep them.
  renderer.debug.checkShaderErrors = import.meta.env.DEV;

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(0, 0, 9);

  const particles = await createParticles(quality.particles, quality, fontUrl);
  scene.add(particles);
  const u = particles.material.uniforms;
  const post = quality.post ? new Post(renderer, INK) : null;
  let usePost = !!post;

  let { width, height } = view;
  let deviceDpr = view.dpr;
  let dpr = Math.min(deviceDpr, quality.dprMax);

  function applySize() {
    if (!width || !height) return;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Portrait screens: pull the camera back so every form fits the width.
    camera.position.z = 9 * Math.max(1, 1.15 / camera.aspect) ** 0.85;
    camera.updateProjectionMatrix();
    u.uAspect.value = camera.aspect;
    // Landscape: forms sit right of the left-aligned copy; portrait: centred.
    u.uShift.value = camera.aspect > 1.2 ? Math.min(1.8, (camera.aspect - 1.2) * 2.4) : 0;
    u.uPixelRatio.value = dpr;
    renderer.getDrawingBufferSize(u.uResolution.value);
    post?.setSize(Math.round(width * dpr), Math.round(height * dpr));
  }
  applySize();

  // Compile off the critical path (KHR_parallel_shader_compile). Program variants
  // depend on the bound target, so warm the particles against the post target —
  // otherwise the first frame compiles synchronously and stalls.
  if (post) renderer.setRenderTarget(post.target);
  await renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(null);
  if (post) await renderer.compileAsync(post.scene, post.camera);

  // --- loop state
  let time = 0, morph = state.morph, accent = 0, intro = state.reduced ? 1 : 0;
  let mx = 9, my = 9, vx = 0, vy = 0, force = 1, pulse = 0, prevMorph = morph;
  let frameEMA = 16.7, sinceTune = 0, handle = 0, last = 0, active = true;
  let overBudget = 0, warmup = 1, degraded = 0, still = state.reduced;

  function tuneResolution(dt, rawMs) {
    frameEMA = frameEMA * 0.94 + rawMs * 0.06;
    watchdog(dt);
    sinceTune += dt;
    if (sinceTune < 1.2) return;
    sinceTune = 0;
    const max = Math.min(deviceDpr, quality.dprMax);
    let next = dpr;
    if (frameEMA > 21) next = Math.max(Math.min(quality.dprMin, max), dpr - 0.15);
    else if (frameEMA < 17.5 && dpr < max) next = Math.min(max, dpr + 0.05);
    if (Math.abs(next - dpr) > 0.01) { dpr = next; applySize(); }
  }

  function watchdog(dt) {
    if ((warmup -= dt) > 0) return;
    overBudget = frameEMA > BUDGET_MS ? overBudget + dt : 0;
    if (overBudget < OVER_BUDGET_S) return;
    overBudget = 0;
    warmup = 1;
    if (degraded++ === 0) {
      dpr = Math.min(deviceDpr, quality.dprMax, quality.dprMin);
      applySize();
      usePost = false;
      const geo = particles.geometry;
      geo.instanceCount = Math.ceil(geo.instanceCount / 2);
      u.uGain.value *= Math.SQRT2;
    } else {
      // Still frame: the loop stops for good; scroll beats re-render on demand.
      still = true;
      intro = 1;
      stop();
      lastStill = -1;
      renderStill();
    }
  }

  function frame(dt) {
    if (!state.reduced) time += dt;
    const target = state.morph;
    morph = still ? Math.round(target) : damp(morph, target, 3.2, dt);
    accent = damp(accent, ACCENT[Math.round(morph)] ?? 0, 1.5, dt);
    intro = damp(intro, 1, 0.9, dt);

    const tx = state.pointer ? state.mouse.x : 9, ty = state.pointer ? state.mouse.y : 9;
    const nx = damp(mx, tx, 7, dt), ny = damp(my, ty, 7, dt);
    if (dt > 0) { vx = damp(vx, (nx - mx) / dt, 5, dt); vy = damp(vy, (ny - my) / dt, 5, dt); }
    mx = nx; my = ny;
    force = damp(force, state.hold ? -2.4 : 1, state.hold ? 2.2 : 3.5, dt);

    const speed = dt > 0 ? Math.abs(morph - prevMorph) / dt : 0;
    prevMorph = morph;
    pulse = damp(pulse, Math.min(1, speed * 1.4), 6, dt);

    // Gentle parallax tilt from the cursor.
    particles.rotation.y = damp(particles.rotation.y, state.pointer ? state.mouse.x * 0.12 : 0, 2, dt);
    particles.rotation.x = damp(particles.rotation.x, state.pointer ? -state.mouse.y * 0.08 : 0, 2, dt);

    u.uTime.value = time;
    u.uMorph.value = Math.min(5, Math.max(0, morph));
    u.uMouse.value.set(mx, my);
    u.uMouseVel.value.set(vx, vy);
    u.uMouseForce.value = force;
    u.uAccent.value = accent;
    u.uIntro.value = intro;

    if (usePost) {
      const pu = post.material.uniforms;
      pu.uTime.value = time;
      pu.uPulse.value = state.reduced ? 0 : pulse;
      pu.uWipe.value = (morph % 1) * 1.7 - 0.35;
      post.render(renderer, scene, camera);
    } else {
      renderer.render(scene, camera);
    }
  }

  function loop(now) {
    handle = raf(loop);
    const rawMs = last ? now - last : 16.7;
    const dt = Math.min(0.05, rawMs / 1000);
    last = now;
    frame(dt);
    if (handle) tuneResolution(dt, rawMs);
  }

  function start() {
    if (handle || still || !active) return;
    last = 0;
    // A resumed tab or scrolled-back canvas starts with a fresh budget window.
    overBudget = 0;
    warmup = 1;
    handle = raf(loop);
  }
  function stop() {
    caf(handle);
    handle = 0;
  }

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); });
  canvas.addEventListener('webglcontextrestored', () => start());

  // Reduced motion / watchdog: a still frame, re-rendered only when the beat changes.
  let lastStill = -1;
  function renderStill() {
    const beat = Math.round(state.morph);
    if (beat === lastStill) return;
    lastStill = beat;
    frame(0);
  }

  frame(0);
  start();

  return {
    /** Pause when the tab is hidden or the canvas is off-screen. */
    setActive(on) {
      active = on;
      on ? start() : stop();
    },
    resize(w, h, devicePixelRatio) {
      // Ignore height-only jitter from mobile toolbars.
      if (w === width && Math.abs(h - height) < 120 && devicePixelRatio === deviceDpr) return;
      width = w; height = h;
      deviceDpr = devicePixelRatio;
      dpr = Math.min(dpr, deviceDpr, quality.dprMax);
      applySize();
      if (still) frame(0);
    },
    /** Shared state changed: only a still frame needs an explicit re-render. */
    sync() {
      if (still) renderStill();
    },
  };
}
