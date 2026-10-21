// Instanced quads: `position` is the quad corner (−1..1); per-instance data below.
// Six scroll-keyed targets. 0–3 are baked (normalized Int16 × SCALE); 4 (ribbons)
// and 5 (tunnel/portal) are derived from gl_InstanceID so they can flow over time
// without costing memory or upload.

#define SCALE 1.0

attribute vec3 aP0;
attribute vec3 aP1;
attribute vec3 aP2;
attribute vec3 aP3;
attribute vec4 aSeed; // x: stagger, y: size, z: colour, w: noise phase

uniform float uTime;
uniform float uMorph;
uniform float uAmp[6];
uniform float uBright[6];
uniform float uShift;   // horizontal offset for landscape compositions
uniform float uPixelRatio;
uniform vec2 uResolution; // drawing-buffer pixels
uniform float uSize;
uniform float uAspect;
uniform vec2 uMouse;      // NDC
uniform vec2 uMouseVel;   // NDC / s, damped
uniform float uMouseForce; // + repel, − attract (click & hold)
uniform float uAccent;
uniform float uIntro;

varying vec3 vColor;
varying float vAlpha;
varying vec2 vCorner;

#include <noise>

const float PI = 3.14159265;

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }

uint hash(uint x) {
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}
float rnd(uint k) { return float(hash(uint(gl_InstanceID) * 8u + k)) * (1.0 / 4294967295.0); }

// Ribbon parameters: (u along, v across — biased to the edges, ribbon id).
vec3 ribbonParams() {
  float v = rnd(1u) < 0.55 ? sign(rnd(2u) - 0.5) * (0.85 + rnd(3u) * 0.15) : rnd(2u) * 2.0 - 1.0;
  return vec3(rnd(0u) * 2.0 - 1.0, v, floor(rnd(4u) * 6.0));
}

// Tunnel parameters: (angle, depth phase — negative marks the portal ring, radius).
vec3 tunnelParams() {
  float a = rnd(5u) * 6.2831853;
  float tri = rnd(6u) + rnd(7u) - 1.0;
  if (rnd(4u) < 0.16) {
    float r = rnd(3u) < 0.8 ? 1.5 + tri * 0.06 : 1.5 + abs(tri) * 0.6;
    return vec3(a, -1.0, r);
  }
  if (rnd(2u) < 0.35) a = floor(a / 6.2831853 * 56.0) * (6.2831853 / 56.0);
  float r = rnd(1u) < 0.86 ? 2.35 + tri * 0.12 : 2.6 + rnd(3u) * 2.2;
  return vec3(a, rnd(0u), r);
}

vec4 ribbon(vec3 q) {
  float id = q.z;
  float speed = 0.018 + 0.01 * fract(id * 0.618);
  float u = fract(q.x * 0.5 + 0.5 + uTime * speed) * 2.0 - 1.0;
  float x = u * 6.8;
  float ph = id * 1.37;
  float y = sin(x * 0.52 + uTime * 0.32 + ph) * 0.62
          + sin(x * 0.21 - uTime * 0.18 + ph * 2.3) * 0.48
          + (id - 2.5) * 0.3;
  float z = cos(x * 0.37 + uTime * 0.27 + ph) * 1.1 - 0.4;
  float tw = x * 0.55 + uTime * 0.45 + ph;
  float w = 0.26 * q.y;
  float edge = smoothstep(1.0, 0.82, abs(u));
  return vec4(x, y + cos(tw) * w, z + sin(tw) * w, edge);
}

vec4 tunnel(vec3 q) {
  // q.y < 0 marks the portal ring at the end of the tunnel.
  if (q.y < 0.0) {
    float a = q.x + uTime * 0.12;
    float r = q.z * (1.0 + 0.025 * sin(q.x * 9.0 + uTime * 1.3));
    return vec4(cos(a) * r, sin(a) * r, -6.0 + sin(q.x * 5.0 + uTime) * 0.12, 1.0);
  }
  float d = fract(q.y + uTime * 0.03);
  float z = mix(-18.0, 7.0, d);
  float a = q.x + z * 0.07 + uTime * 0.04;
  float r = q.z * (1.0 + 0.04 * sin(z * 0.6 - uTime));
  float edge = smoothstep(0.0, 0.18, d) * smoothstep(1.0, 0.86, d);
  return vec4(cos(a) * r, sin(a) * r, z, edge);
}

vec4 target(float i) {
  float t = uTime;
  if (i < 0.5) return vec4(rotY(aP0 * SCALE, t * 0.035) + vec3(uShift, 0.25, 0.0), 1.0);
  if (i < 1.5) return vec4(rotY(aP1 * SCALE, t * 0.12) + vec3(uShift * 0.75, 0.0, 0.0), 1.0);
  if (i < 2.5) return vec4(rotY(aP2 * SCALE, sin(t * 0.25) * 0.32), 1.0);
  if (i < 3.5) return vec4(rotX(rotY(aP3 * SCALE, t * 0.16), 0.35 + sin(t * 0.2) * 0.15), 1.0);
  if (i < 4.5) return ribbon(ribbonParams());
  return tunnel(tunnelParams());
}

void main() {
  float idx = floor(uMorph);
  float t = uMorph - idx;
  float tt = smoothstep(0.0, 1.0, clamp((t - aSeed.x * 0.4) / 0.6, 0.0, 1.0));
  float transit = sin(tt * PI);

  vec4 A = target(idx);
  vec4 B = target(min(idx + 1.0, 5.0));
  vec3 pos = mix(A.xyz, B.xyz, tt);
  float edge = mix(A.w, B.w, tt);

  int ia = int(idx);
  int ib = min(ia + 1, 5);
  float amp = mix(uAmp[ia], uAmp[ib], tt) + transit * 0.55;
  // Intro: particles condense out of a wider, wilder field.
  amp += (1.0 - uIntro) * 2.0;

  vec3 flow = curlNoise(pos * 0.32 + vec3(0.0, uTime * 0.045, aSeed.w * 0.6));
  pos += flow * amp * 0.26;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vec4 clip = projectionMatrix * mv;

  // Cursor field, evaluated in screen space so it feels identical at every depth.
  vec2 ndc = clip.xy / clip.w;
  vec2 dm = (ndc - uMouse) * vec2(uAspect, 1.0);
  float r2 = dot(dm, dm);
  float fall = exp(-r2 * 7.0);
  vec2 dir = dm / (sqrt(r2) + 1e-4);
  vec2 swirl = vec2(-dir.y, dir.x) * step(uMouseForce, 0.0) * 0.6;
  float depth = -mv.z;
  float k = depth * 0.11;
  mv.xy += (dir * uMouseForce + swirl * -uMouseForce) * fall * k;
  mv.xy += uMouseVel * fall * k * 0.12;
  mv.z += fall * abs(uMouseForce) * 0.5;

  gl_Position = projectionMatrix * mv;
  depth = -mv.z;

  float size = uSize * (0.45 + aSeed.y * aSeed.y * 1.55);
  float px = clamp(size * uPixelRatio * (9.0 / depth), 0.0, 48.0);
  // Expand the quad in clip space: px is the sprite diameter in buffer pixels.
  gl_Position.xy += position.xy * px / uResolution * gl_Position.w;
  vCorner = position.xy;

  float fog = smoothstep(34.0, 9.0, depth) * smoothstep(1.2, 4.5, depth);
  float bright = mix(uBright[ia], uBright[ib], tt);
  vAlpha = fog * edge * bright * (0.38 + 0.62 * aSeed.y) * (0.65 + 0.35 * uIntro);

  // Iridescent accent: fresnel-ish term from the view angle to the form centre.
  vec3 n = normalize(normalMatrix * normalize(pos + vec3(1e-4)));
  float fres = 1.0 - abs(dot(normalize(-mv.xyz), n));
  fres *= fres;
  float hue = 0.5 + 0.5 * sin(fres * 4.5 + aSeed.z * 6.2831 + uTime * 0.3 + uAccent * 3.0);
  vec3 irid = mix(vec3(0.486, 0.953, 1.0), vec3(0.545, 0.361, 1.0), hue);
  vec3 bone = vec3(0.925, 0.91, 0.882);
  float accent = smoothstep(0.78, 0.95, aSeed.z) + fall * 0.9 + transit * 0.3 + fres * 0.35;
  vColor = mix(bone * 0.82, irid, clamp(accent, 0.0, 1.0));
}
