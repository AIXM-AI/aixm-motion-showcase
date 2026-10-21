// Main-thread side of the WebGL scene. Prefers a worker + OffscreenCanvas; falls
// back to rendering on the main thread where that is unsupported. Either way the
// host owns DOM concerns (size, visibility) and forwards the shared state.
import { createContext, detectQuality, qualityEnv } from '../core/quality.js';

const FONT_URL = '/fonts/montserrat-var.woff2';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} state  shared scroll/pointer state, mutated by main.js
 * @returns {Promise<{ sync(): void }>} resolves once the first frame is on screen
 */
export function startGL(canvas, state) {
  const env = qualityEnv();
  const view = () => ({ width: canvas.clientWidth, height: canvas.clientHeight, dpr: window.devicePixelRatio || 1 });
  const useWorker = typeof canvas.transferControlToOffscreen === 'function' && typeof Worker === 'function';
  return useWorker ? startWorker(canvas, state, env, view) : startMain(canvas, state, env, view);
}

function watch(canvas, setActive, resize) {
  let visible = document.visibilityState === 'visible', onscreen = true;
  const update = () => setActive(visible && onscreen);
  document.addEventListener('visibilitychange', () => { visible = document.visibilityState === 'visible'; update(); });
  new IntersectionObserver(([e]) => { onscreen = e.isIntersecting; update(); }).observe(canvas);
  window.addEventListener('resize', resize, { passive: true });
}

function startWorker(canvas, state, env, view) {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const offscreen = canvas.transferControlToOffscreen();
  const snapshot = () => ({ morph: state.morph, mouse: { ...state.mouse }, pointer: state.pointer, hold: state.hold, reduced: state.reduced });
  worker.postMessage(
    { type: 'init', canvas: offscreen, state: snapshot(), env, view: view(), fontUrl: new URL(FONT_URL, location.href).href },
    [offscreen],
  );

  // Coalesce state updates to one message per frame.
  let queued = false;
  const flush = () => { queued = false; worker.postMessage({ type: 'state', state: snapshot() }); };
  const api = {
    sync() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(flush);
    },
  };

  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') {
        watch(canvas, (value) => worker.postMessage({ type: 'active', value }), () => worker.postMessage({ type: 'resize', ...view() }));
        // Catch up on scroll/pointer changes made while the worker was booting.
        api.sync();
        resolve(api);
      } else if (data.type === 'fail') {
        worker.terminate();
        reject(new Error(data.reason));
      }
    };
    worker.onerror = (e) => reject(e.error || new Error(e.message));
  });
}

async function startMain(canvas, state, env, view) {
  const context = createContext(canvas);
  const quality = detectQuality(context, env);
  if (!quality.webgl) throw new Error(quality.software ? `software renderer: ${quality.renderer}` : 'webgl2 unavailable');
  const { createScene } = await import('./Renderer.js');
  const scene = await createScene({ canvas, context, state, quality, view: view() });
  watch(canvas, (on) => scene.setActive(on), () => { const v = view(); scene.resize(v.width, v.height, v.dpr); });
  return { sync: () => scene.sync() };
}
