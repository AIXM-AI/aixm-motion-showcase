# AIXM Motion Showcase

AIXM's flagship motion site: one persistent GPU particle field behind a semantic,
SEO-ready page. As you scroll, the particles go from noise to structure to form to
flow, and finally into a portal. The story is AI × motion, "signal from noise".

- **Live:** https://showcase.aixm.ai
- **Repo:** https://github.com/AIXM-AI/aixm-motion-showcase

## Features

- **GPU particle system.** Up to 96k instanced quads morph between six scroll-keyed
  targets: a spiral noise nebula, a sphere/brain, the AIXM wordmark, a torus knot,
  flowing ribbons and a tunnel/portal. They move with curl noise, soft depth-faded
  sprites and an accent iridescence that shifts with each section.
- **Interaction.** The cursor repels the field. Click and hold anywhere off a
  control to gather it instead. A gentle parallax tilt follows the pointer.
- **Single-pass post.** One pass does bloom-style glow, chromatic aberration, a
  section "wipe" pulse, grain and vignette.
- **Motion design.** Lenis smooth scroll drives GSAP ScrollTrigger. The page has
  split-line and word reveals, scrambled eyebrows, magnetic buttons, a nav text
  roll, card tilt with a cursor glow, count-up stats, a pinned horizontal process
  track and a custom cursor.
- **Content.** The copy is honest: no fake clients or testimonials.

## Tech stack

- [Vite](https://vite.dev) with vanilla ES modules, no framework
- [three.js](https://threejs.org) and custom GLSL in `src/gl/shaders/*.glsl`, imported with `?raw`
- [GSAP](https://gsap.com) (ScrollTrigger, CustomEase) and [Lenis](https://lenis.darkroom.engineering)
- Cloudflare Workers static assets (`wrangler.jsonc`) for hosting

## Getting started

```bash
npm i
npm run dev        # dev server with HMR
npm run build      # production build → dist/ (no sourcemaps)
npm run preview    # serve dist/ locally
npx wrangler deploy  # publish dist/ to showcase.aixm.ai (Cloudflare Workers)
```

## Folder structure

```
index.html              semantic page content, SEO meta, critical markup
src/
  main.js               scroll, reveals, micro-interactions, lazy WebGL boot
  styles.css            art direction, layout, no-WebGL / reduced-motion styles
  core/quality.js       quality tiers, software-GL detection, WebGL2 context
  gl/
    host.js             main-thread side: worker + OffscreenCanvas or main-thread fallback
    worker.js           WebGL worker entry (owns the OffscreenCanvas)
    Renderer.js         scene, render loop, adaptive DPR, frame-budget watchdog
    Particles.js        instanced particle geometry and material
    shapes.js           time-sliced generators for the baked morph targets
    Post.js             render target and composite pass
    shaders/            particle and post GLSL, curl noise
public/
  fonts/                Montserrat variable woff2 + OFL.txt
  _headers              long-term caching for /assets/* and /fonts/*
docs/DESIGN_BRIEF.md    references and art direction
wrangler.jsonc          Cloudflare Workers static-assets config
```

## Performance strategy

The target is Lighthouse ≥ 90 on mobile and desktop with CLS ≈ 0. The approach:

- **Text first.** The hero copy is the LCP element and is animated in CSS. The
  stylesheet is inlined into `index.html`, and the font is self-hosted with
  `font-display: swap` and a size-adjusted fallback, so swapping causes no layout
  shift.
- **WebGL loads late.** The GL code is only imported after `load` and
  `requestIdleCallback`. three.js lives in lazy chunks and is never in the main
  bundle.
- **Off the main thread.** When `OffscreenCanvas` is available, everything runs in
  a module worker: context creation, quality probing, target generation, shader
  compiles and every frame. Where it isn't available, the main-thread fallback
  generates targets in ~6 ms slices and compiles shaders with `compileAsync`
  (`KHR_parallel_shader_compile`), so no task gets near 50 ms.
- **Software-GL detection.** `failIfMajorPerformanceCaveat` does not reliably reject
  software rasterisers. The unmasked renderer string is checked as well (SwiftShader,
  including ANGLE's `Vulkan (SwiftShader Device)`, plus llvmpipe, softpipe, lavapipe,
  "Software" and Basic Render Driver). On a match the page uses the CSS composition
  and never runs a render loop. Headless Chrome without a GPU, which is what
  Lighthouse and PageSpeed use, takes this path.
- **Adaptive resolution.** The device pixel ratio follows a moving average of frame
  time, between each tier's `dprMin` and `dprMax`.
- **Frame-budget watchdog.** If frames stay above 40 ms (under 25 fps) for about 2
  seconds on any device, the scene degrades one step: minimum resolution, no post
  and half the particles. If that still misses the budget, the loop stops for good
  and a still frame is shown, re-rendered only when the scroll section changes.
- **Pausing.** The loop pauses while the tab is hidden or the canvas is off-screen.

### Quality tiers

| Tier | Particles (desktop / mobile) | DPR range | Post |
| ---- | ---------------------------- | --------- | ---- |
| 0 — low  | 14k / 14k | 0.75–1   | off |
| 1 — mid  | 36k / 22k | 0.85–1.5 | on  |
| 2 — high | 96k / 22k | 1–2      | on  |

The tier is scored from the GPU renderer string, CPU cores, device memory, max
texture size and whether the device is mobile.

To force a tier for testing, append `?q=0`, `?q=1` or `?q=2` to the URL. Software
renderers still get the CSS fallback, even with `?q=`.

## Accessibility

- **Reduced motion.** With `prefers-reduced-motion: reduce`, the page uses native
  scroll with no Lenis, pinning or scrub effects. Content is shown in its final
  state, and WebGL draws one still frame per section instead of animating.
- **No WebGL.** Without WebGL2, or with software GL, `html.no-webgl` swaps the
  canvas for a layered CSS gradient composition.
- **Semantics and contrast.** The markup is semantic, with a skip link and visible
  focus states. Scrambled labels keep their real text for screen readers, and
  dimmed scroll-reveal words stay at ≥ 3:1 contrast.
- **Custom cursor.** It is only enabled on fine, hover-capable pointers.

## Credits

- Design and development: AIXM / RyanX. Code is MIT-licensed, see [LICENSE](LICENSE).
- [Montserrat](https://github.com/JulietaUla/Montserrat) by Julieta Ulanovsky et
  al., under the SIL Open Font License 1.1 ([public/fonts/OFL.txt](public/fonts/OFL.txt)).
- Built with three.js (MIT), GSAP (Standard "no charge" license) and Lenis (MIT).
- The art direction references studied are listed in
  [docs/DESIGN_BRIEF.md](docs/DESIGN_BRIEF.md). Only patterns were studied; no code
  or assets were copied.
