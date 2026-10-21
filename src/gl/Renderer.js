import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createParticles } from './Particles.js';
import { Post } from './Post.js';

const INK = 0x07070a;
// Environment accent per scene beat (feeds the iridescence phase).
const ACCENT = [0.0, 0.35, 0.7, 1.05, 1.4, 1.8];

// Frame-rate independent damping: same feel at 30, 60 or 120 Hz.
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

/**
 * @param {HTMLCanvasElement} canvas
 * @param {WebGL2RenderingContext} context  created by core/quality.js
 * @param {{ morph:number, mouse:{x:number,y:number}, pointer:boolean, hold:boolean, reduced:boolean }} state
 * @param {ReturnType<import('../core/quality.js').detectQuality>} quality
 */
export async function createScene(canvas, context, state, quality) {
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
  // Synchronous program-status queries stall the main thread; dev builds keep them.
  renderer.debug.checkShaderErrors = import.meta.env.DEV;

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(0, 0, 9);

  const particles = await createParticles(quality.particles, quality);
  scene.add(particles);
  const u = particles.material.uniforms;
  const post = quality.post ? new Post(renderer, INK) : null;

  let dpr = Math.min(window.devicePixelRatio || 1, quality.dprMax);
  let width = 0, height = 0;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    width = w; height = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Portrait screens: pull the camera back so every form fits the width.
    camera.position.z = 9 * Math.max(1, 1.15 / camera.aspect) ** 0.85;
    camera.updateProjectionMatrix();
    u.uAspect.value = camera.aspect;
    // Landscape: forms sit right of the left-aligned copy; portrait: centred.
    u.uShift.value = camera.aspect > 1.2 ? Math.min(1.8, (camera.aspect - 1.2) * 2.4) : 0;
    u.uPixelRatio.value = dpr;
    renderer.getDrawingBufferSize(u.uResolution.value);
    post?.setSize(Math.round(w * dpr), Math.round(h * dpr));
  }

  let lastW = 0;
  const onResize = () => {
    // Ignore height-only jitter from mobile toolbars.
    const w = canvas.clientWidth;
    if (w === lastW && Math.abs(canvas.clientHeight - height) < 120) return;
    lastW = w;
    resize();
  };
  resize();
  lastW = width;
  window.addEventListener('resize', onResize, { passive: true });

  // Compile off the critical path (KHR_parallel_shader_compile). Program variants
  // depend on the bound target, so warm the particles against the post target —
  // otherwise the first frame compiles synchronously and stalls the main thread.
  if (post) renderer.setRenderTarget(post.target);
  await renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(null);
  if (post) await renderer.compileAsync(post.scene, post.camera);

  // --- loop state
  let time = 0, morph = state.morph, accent = 0, intro = state.reduced ? 1 : 0;
  let mx = 9, my = 9, vx = 0, vy = 0, force = 1, pulse = 0, prevMorph = morph;
  let frameEMA = 16.7, sinceTune = 0, raf = 0, last = 0;
  let visible = true, onscreen = true;

  function tuneResolution(dt) {
    frameEMA = frameEMA * 0.94 + dt * 1000 * 0.06;
    sinceTune += dt;
    if (sinceTune < 1.2) return;
    sinceTune = 0;
    const max = Math.min(window.devicePixelRatio || 1, quality.dprMax);
    let next = dpr;
    if (frameEMA > 21) next = Math.max(quality.dprMin, dpr - 0.15);
    else if (frameEMA < 17.5 && dpr < max) next = Math.min(max, dpr + 0.05);
    if (Math.abs(next - dpr) > 0.01) { dpr = next; resize(); }
  }

  function frame(dt) {
    if (!state.reduced) time += dt;
    const target = state.morph;
    morph = state.reduced ? Math.round(target) : damp(morph, target, 3.2, dt);
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

    if (post) {
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
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    frame(dt);
    tuneResolution(dt);
  }

  function start() {
    if (raf || state.reduced || !visible || !onscreen) return;
    last = 0;
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  document.addEventListener('visibilitychange', () => {
    visible = document.visibilityState === 'visible';
    visible ? start() : stop();
  });
  new IntersectionObserver(([e]) => {
    onscreen = e.isIntersecting;
    onscreen ? start() : stop();
  }).observe(canvas);

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); });
  canvas.addEventListener('webglcontextrestored', () => start());

  // Reduced motion: a still frame, re-rendered only when the scroll beat changes.
  let lastStill = -1;
  const renderStill = () => {
    const beat = Math.round(state.morph);
    if (beat === lastStill) return;
    lastStill = beat;
    frame(0);
  };

  frame(0);
  start();

  return {
    renderStill,
    get dpr() { return dpr; },
  };
}
