// WebGL worker: owns the OffscreenCanvas, so context creation, shader compiles,
// geometry generation and every frame stay off the main thread.
import { createContext, detectQuality } from '../core/quality.js';
import { createScene } from './Renderer.js';

let scene = null;
let state = null;

self.onmessage = async ({ data }) => {
  switch (data.type) {
    case 'init': {
      state = data.state;
      const context = createContext(data.canvas);
      const quality = detectQuality(context, data.env);
      if (!quality.webgl) {
        self.postMessage({ type: 'fail', reason: quality.software ? `software renderer: ${quality.renderer}` : 'webgl2 unavailable' });
        return;
      }
      try {
        scene = await createScene({ canvas: data.canvas, context, state, quality, view: data.view, fontUrl: data.fontUrl });
        self.postMessage({ type: 'ready', tier: quality.tier });
      } catch (err) {
        self.postMessage({ type: 'fail', reason: String(err) });
      }
      break;
    }
    case 'state':
      if (!state) return;
      Object.assign(state, data.state);
      scene?.sync();
      break;
    case 'resize':
      scene?.resize(data.width, data.height, data.dpr);
      break;
    case 'active':
      scene?.setActive(data.value);
      break;
  }
};
