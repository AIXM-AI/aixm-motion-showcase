// Single composite pass: mip-chain glow, chromatic aberration, diagonal
// transition wipe, filmic roll-off, vignette and grain.

uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uTime;
uniform float uPulse;   // 0..1, scroll-transition energy
uniform float uWipe;    // diagonal band position
uniform float uBloom;
uniform vec3 uInk;

varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 glow(vec2 uv) {
  vec2 px = 1.0 / uRes;
  vec3 b = vec3(0.0);
  b += textureLod(tScene, uv + px * vec2( 3.0,  2.0), 2.0).rgb * 0.30;
  b += textureLod(tScene, uv + px * vec2(-2.0, -3.0), 2.0).rgb * 0.30;
  b += textureLod(tScene, uv + px * vec2( 6.0, -5.0), 3.0).rgb * 0.28;
  b += textureLod(tScene, uv + px * vec2(-5.0,  6.0), 3.0).rgb * 0.28;
  b += textureLod(tScene, uv + px * vec2(10.0,  9.0), 4.0).rgb * 0.24;
  b += textureLod(tScene, uv + px * vec2(-9.0,-10.0), 4.0).rgb * 0.24;
  b += textureLod(tScene, uv, 5.0).rgb * 0.36;
  b += textureLod(tScene, uv, 6.0).rgb * 0.30;
  return b;
}

void main() {
  vec2 uv = vUv;
  vec2 dc = uv - 0.5;

  float diag = uv.x * 0.62 + (1.0 - uv.y) * 0.38;
  float band = exp(-pow((diag - uWipe) * 7.0, 2.0)) * uPulse;
  vec2 cell = floor(uv * vec2(28.0, 16.0));
  float blockJ = step(0.72, hash(cell + floor(uTime * 18.0)));
  uv.x += (hash(cell.yx + floor(uTime * 24.0)) - 0.5) * 0.035 * band * blockJ;

  float ca = 0.0016 + dot(dc, dc) * 0.006 + band * 0.012;
  vec2 off = dc * ca * 4.0;
  vec3 col;
  col.r = texture2D(tScene, uv + off).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - off).b;

  col += glow(uv) * uBloom * (1.0 + band * 0.8);
  col = 1.0 - exp(-col * 1.25);

  float vig = smoothstep(1.15, 0.25, length(dc * vec2(1.0, 0.85)) * 1.25);
  col *= mix(0.55, 1.0, vig);
  col += uInk;
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.13) * 91.7) - 0.5) * 0.032;

  gl_FragColor = vec4(col, 1.0);
}
