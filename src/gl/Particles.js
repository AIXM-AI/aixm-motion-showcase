import {
  AdditiveBlending, BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector2,
} from 'three';
import noise from './shaders/noise.glsl?raw';
import vert from './shaders/particles.vert.glsl?raw';
import frag from './shaders/particles.frag.glsl?raw';
import * as shapes from './shapes.js';

// Per-target curl amplitude: chaos in the hero, calm structure afterwards.
const AMP = [1.25, 0.22, 0.1, 0.18, 0.14, 0.08];
// Per-target exposure: sparse forms (nebula, portal) carry more light per mote.
const BRIGHT = [1.75, 1.0, 1.05, 1.0, 1.15, 1.9];

const nextTask = () => new Promise((res) => setTimeout(res, 0));

// Drain a generator in ~6 ms slices so no task gets near the 50 ms long-task line.
async function drain(gen) {
  for (;;) {
    const end = performance.now() + 6;
    let step;
    do step = gen.next(); while (!step.done && performance.now() < end);
    if (step.done) return;
    await nextTask();
  }
}

// Each particle is an instanced camera-facing quad rather than a GL point: no
// point-size caps on mobile GPUs, and no draw-time point-sprite shader variant
// (ANGLE/D3D11 compiles one synchronously on the first POINTS draw).
export async function createParticles(count, quality, fontUrl) {
  const geo = new InstancedBufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.instanceCount = count;
  const glyphSource = await shapes.prepareGlyph(fontUrl);
  const builders = [
    ['aP0', (o) => shapes.cloud(o, count)],
    ['aP1', (o) => shapes.brain(o, count)],
    ['aP2', (o) => shapes.glyph(o, count, glyphSource)],
    ['aP3', (o) => shapes.knot(o, count)],
  ];
  for (const [name, make] of builders) {
    const out = new Int16Array(count * 3);
    await drain(make(out));
    geo.setAttribute(name, new InstancedBufferAttribute(out, 3, true));
  }
  const seed = new Uint8Array(count * 4);
  await drain(shapes.seeds(seed, count));
  geo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4, true));

  const material = new ShaderMaterial({
    vertexShader: vert.replace('#include <noise>', noise).replace('#define SCALE 1.0', `#define SCALE ${shapes.SCALE.toFixed(1)}`),
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uAmp: { value: AMP },
      uBright: { value: BRIGHT },
      uShift: { value: 0 },
      uPixelRatio: { value: 1 },
      uResolution: { value: new Vector2(1, 1) },
      uSize: { value: 2.3 * quality.pointScale },
      uAspect: { value: 1 },
      uMouse: { value: new Vector2(9, 9) },
      uMouseVel: { value: new Vector2() },
      uMouseForce: { value: 1 },
      uAccent: { value: 0 },
      uIntro: { value: 0 },
      // Fewer particles → each one carries more light.
      uGain: { value: Math.min(1.6, Math.sqrt(96000 / count)) * (quality.post ? 0.62 : 0.5) },
    },
  });

  const particles = new Mesh(geo, material);
  particles.frustumCulled = false;
  return particles;
}
