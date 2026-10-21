uniform float uGain;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float r = length(p) * 2.0;
  if (r > 1.0) discard;
  // Soft halo plus a tight core reads as a lit mote rather than a flat disc.
  float halo = 1.0 - r;
  halo *= halo;
  float core = smoothstep(0.32, 0.0, r);
  float a = (halo * 0.55 + core * 0.7) * vAlpha * uGain;
  gl_FragColor = vec4(vColor, a);
}
