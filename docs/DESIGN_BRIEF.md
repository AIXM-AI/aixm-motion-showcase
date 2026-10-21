# AIXM Motion Showcase — Reference & Design Brief

## References studied (patterns only — no code or assets copied)
- **Lusion v3** (Awwwards SOTY 2023): one fixed full-screen WebGL canvas behind the DOM; one continuous 3D "picture" advancing per scroll stretch; cursor physically pushes objects; restrained palette (white/graphite + one accent); frame-rate-independent damped scroll (`1-exp(-k·dt)`); cinematic tunnel finale into "Let's work together".
- **Igloo Inc** (Awwwards SOTY 2024): cold cinematic material language; cursor proximity lifts/glows elements; 100k+ particle hero form; section-to-section transitions done as ONE full-screen shader (diagonal cut + chromatic aberration + block displacement); custom GSAP eases; scrambled mono labels.
- **Active Theory v4**: environment colour driven by content; layered post (DOF, RGB shift, volumetric glow); hidden interactions (click-and-hold) that prove it's real-time.
- **Bruno Simon**: playfulness and discoverability; the scene is the interface.

## Direction for AIXM: "Signal from noise"
AIXM = AI × motion. Story: chaotic particle noise → organises into structure (intelligence) → becomes form (3D) → becomes flow (automation) → resolves to a calm portal (contact).
- **Palette**: ink #07070a, bone #ece8e1, graphite #2a2a30, single accent electric #7cf3ff→ violet #8b5cff gradient used sparingly.
- **Type**: Montserrat variable (self-hosted, OFL), huge tight display (clamp 56–180px, -0.04em), small mono-ish uppercase eyebrows with letter scramble on hover.
- **3D**: one persistent GPU particle system (60–120k desktop, 15–25k mobile) morphing between scroll-keyed targets: noise cloud → AIXM glyph/sphere → torus-knot "form" → flowing ribbon field → tunnel/portal. Curl-noise in vertex shader, cursor repulsion field, depth-faded soft sprites, fresnel/iridescent tint. Post: lightweight bloom + chromatic aberration + film grain + vignette, single composite pass; disabled on low tier.
- **Pacing**: hero holds; each section = one scene beat; pinned horizontal Process track; section transitions accent with a shader "wipe" pulse.
- **Micro-interactions**: magnetic buttons, nav link text roll, card 3D tilt + cursor-follow glow, custom blend cursor, scramble eyebrows, count-up stats.
- **Performance budget**: HTML/text LCP first; WebGL chunk loaded on idle after first paint; DPR clamp + adaptive resolution from frame-time; 3 quality tiers; reduced-motion = native scroll + static frame; no-WebGL = CSS gradient fallback. Target Lighthouse ≥90 mobile & desktop, CLS≈0.
